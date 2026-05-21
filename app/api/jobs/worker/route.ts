import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getQStashReceiver } from "@/lib/qstash";
import {
  getJob,
  loadPayload,
  markProcessing,
  reportBatchResult,
  type BatchResult,
} from "@/lib/jobs";
import { buildZip, type ZipEntry } from "@/lib/zip";
import type { DocumentRequest } from "@/lib/3pl/types";

export const maxDuration = 300;

type ManifestRow = { name: string } & Record<string, string | number>;

function buildManifestTsv(rows: ManifestRow[]): Buffer {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (k !== "name") keys.add(k);
  const cols = ["name", ...Array.from(keys)];
  const header = cols.join("\t");
  const body = rows.map((r) => cols.map((c) => String(r[c] ?? "")).join("\t")).join("\n");
  return Buffer.from(`${header}\n${body}\n`, "utf-8");
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("upstash-signature");
  const bodyText = await req.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  try {
    const ok = await getQStashReceiver().verify({ signature, body: bodyText });
    if (!ok) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { jobId, batchIndex } = JSON.parse(bodyText) as { jobId: string; batchIndex: number };
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (job.status === "done") {
    return NextResponse.json({ ok: true, skipped: "already done" });
  }

  const payload = await loadPayload(jobId);
  if (!payload) {
    await reportBatchResult(jobId, {
      batchIndex,
      blobUrl: null,
      doneInBatch: 0,
      failedInBatch: 0,
      errors: [`Batch ${batchIndex}: payload missing/expired`],
    });
    return NextResponse.json({ error: "Payload missing" }, { status: 410 });
  }

  if (job.status === "pending") await markProcessing(jobId);

  const start = batchIndex * job.batchSize;
  const end = Math.min(start + job.batchSize, payload.documents.length);
  const batchDocs = payload.documents.slice(start, end);

  if (batchDocs.length === 0) {
    await reportBatchResult(jobId, {
      batchIndex,
      blobUrl: null,
      doneInBatch: 0,
      failedInBatch: 0,
      errors: [`Batch ${batchIndex}: empty slice`],
    });
    return NextResponse.json({ ok: true, empty: true });
  }

  const grouped = batchDocs.reduce<Record<string, DocumentRequest[]>>((acc, doc) => {
    (acc[doc.service] ??= []).push(doc);
    return acc;
  }, {});

  const entries: ZipEntry[] = [];
  const errors: string[] = [];
  let doneInBatch = 0;
  let failedInBatch = 0;

  for (const [service, docs] of Object.entries(grouped)) {
    const credential = payload.credentials[service];
    if (!credential) {
      errors.push(`Batch ${batchIndex}/${service}: credential missing`);
      failedInBatch += docs.length;
      continue;
    }

    let adapter: { fetchDocument: (id: string, c: typeof credential) => Promise<{ data: Buffer; ext: string; metadata?: Record<string, string | number> }> };
    try {
      const mod = await import(`@/lib/3pl/${service.toLowerCase()}`);
      adapter = mod.default;
    } catch {
      errors.push(`Batch ${batchIndex}/${service}: adapter unavailable`);
      failedInBatch += docs.length;
      continue;
    }

    const manifest: ManifestRow[] = [];

    const results = await Promise.allSettled(
      docs.map(async (doc) => {
        const result = await adapter.fetchDocument(doc.identifier, credential);
        return { doc, result };
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const doc = docs[i];
      if (r.status === "fulfilled") {
        const { result } = r.value;
        entries.push({
          folder: service,
          filename: `${doc.name}.${result.ext}`,
          data: result.data,
        });
        manifest.push({ name: doc.name, ...(result.metadata ?? {}) });
        doneInBatch++;
      } else {
        const msg = r.reason?.message ?? String(r.reason);
        errors.push(`Batch ${batchIndex}/${service}/${doc.identifier}: ${msg}`);
        manifest.push({ name: doc.name });
        failedInBatch++;
      }
    }

    if (manifest.length) {
      entries.push({
        folder: service,
        filename: "manifest.tsv",
        data: buildManifestTsv(manifest),
      });
    }
  }

  let blobUrl: string | null = null;
  if (entries.length > 0) {
    const zipBuffer = await buildZip(entries);
    const date = new Date(job.createdAt).toISOString().slice(0, 10);
    const idx = String(batchIndex).padStart(3, "0");
    const pathname = `bulk/${date}/${jobId}/part-${idx}.zip`;
    const blob = await put(pathname, zipBuffer, {
      access: "public",
      contentType: "application/zip",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    blobUrl = blob.url;
  }

  const result: BatchResult = {
    batchIndex,
    blobUrl,
    doneInBatch,
    failedInBatch,
    errors,
  };

  const { finalized } = await reportBatchResult(jobId, result);

  return NextResponse.json({ ok: true, batchIndex, doneInBatch, failedInBatch, finalized });
}
