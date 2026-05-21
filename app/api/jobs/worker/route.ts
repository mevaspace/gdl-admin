import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getQStashReceiver } from "@/lib/qstash";
import { getJob, loadPayload, updateJob, deletePayload } from "@/lib/jobs";
import { buildZip, type ZipEntry } from "@/lib/zip";
import type { DocumentRequest } from "@/lib/3pl/types";

export const maxDuration = 800;

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

  const { jobId } = JSON.parse(bodyText) as { jobId: string };
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (job.status === "done") return NextResponse.json({ ok: true, skipped: "already done" });

  const payload = await loadPayload(jobId);
  if (!payload) {
    await updateJob(jobId, { status: "failed", errors: ["Payload expired/missing"] });
    return NextResponse.json({ error: "Payload missing" }, { status: 410 });
  }

  await updateJob(jobId, { status: "processing" });

  const { documents, credentials } = payload;
  const grouped = documents.reduce<Record<string, DocumentRequest[]>>((acc, doc) => {
    (acc[doc.service] ??= []).push(doc);
    return acc;
  }, {});

  const errors: string[] = [];
  const entries: ZipEntry[] = [];
  let doneCount = 0;
  let failedCount = 0;
  const progressFlush = Math.max(1, Math.floor(documents.length / 50));

  async function flushProgress() {
    await updateJob(jobId, { done: doneCount, failed: failedCount });
  }

  for (const [service, docs] of Object.entries(grouped)) {
    const credential = credentials[service];
    if (!credential) {
      errors.push(`Credential untuk ${service} tidak ditemukan`);
      failedCount += docs.length;
      continue;
    }

    let adapter: { fetchDocument: (id: string, c: typeof credential) => Promise<{ data: Buffer; ext: string; metadata?: Record<string, string | number> }> };
    try {
      const mod = await import(`@/lib/3pl/${service.toLowerCase()}`);
      adapter = mod.default;
    } catch {
      errors.push(`Adapter untuk ${service} belum tersedia`);
      failedCount += docs.length;
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
        doneCount++;
      } else {
        const msg = r.reason?.message ?? String(r.reason);
        errors.push(`${service}/${doc.identifier}: ${msg}`);
        manifest.push({ name: doc.name });
        failedCount++;
      }
      if ((doneCount + failedCount) % progressFlush === 0) await flushProgress();
    }

    if (manifest.length) {
      entries.push({ folder: service, filename: "manifest.tsv", data: buildManifestTsv(manifest) });
    }
  }

  if (entries.length === 0) {
    await updateJob(jobId, { status: "failed", done: doneCount, failed: failedCount, errors });
    await deletePayload(jobId);
    return NextResponse.json({ error: "Semua request gagal" }, { status: 200 });
  }

  const zipBuffer = await buildZip(entries);
  const date = new Date().toISOString().slice(0, 10);
  const pathname = `bulk/${date}/${jobId}.zip`;

  const blob = await put(pathname, zipBuffer, {
    access: "public",
    contentType: "application/zip",
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  await updateJob(jobId, {
    status: "done",
    done: doneCount,
    failed: failedCount,
    blobUrl: blob.url,
    errors: errors.length ? errors : undefined,
  });
  await deletePayload(jobId);

  return NextResponse.json({ ok: true });
}
