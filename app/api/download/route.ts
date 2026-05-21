import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { buildZip, type ZipEntry } from "@/lib/zip";
import type { DocumentRequest, ThreePLCredential } from "@/lib/3pl/types";

// Vercel Pro: 60s timeout
export const maxDuration = 60;

interface DownloadRequestBody {
  documents: DocumentRequest[];
  credentials: Record<string, ThreePLCredential>;
}

type ManifestRow = { name: string } & Record<string, string | number>;

function buildManifestTsv(rows: ManifestRow[]): Buffer {
  const keys = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) if (k !== "name") keys.add(k);
  }
  const cols = ["name", ...Array.from(keys)];
  const header = cols.join("\t");
  const body = rows.map((r) => cols.map((c) => String(r[c] ?? "")).join("\t")).join("\n");
  return Buffer.from(`${header}\n${body}\n`, "utf-8");
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  try {
    await verifyToken(token ?? "");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: DownloadRequestBody = await req.json();
  const { documents, credentials } = body;

  if (!documents?.length) {
    return NextResponse.json({ error: "Tidak ada dokumen" }, { status: 400 });
  }

  // Group by service
  const grouped = documents.reduce<Record<string, DocumentRequest[]>>((acc, doc) => {
    (acc[doc.service] ??= []).push(doc);
    return acc;
  }, {});

  interface ServiceOutput {
    service: string;
    entries: ZipEntry[];
    manifest: ManifestRow[];
  }

  // Load adapters dynamically
  const adapterResults = await Promise.allSettled(
    Object.entries(grouped).map(async ([service, docs]): Promise<ServiceOutput> => {
      const credential = credentials[service];
      if (!credential) throw new Error(`Credential untuk ${service} tidak ditemukan`);

      const adapterModule = await import(`@/lib/3pl/${service.toLowerCase()}`).catch(() => {
        throw new Error(`Adapter untuk ${service} belum tersedia`);
      });

      const adapter = adapterModule.default;
      const entries: ZipEntry[] = [];
      const manifest: ManifestRow[] = [];

      const docResults = await Promise.allSettled(
        docs.map(async (doc) => {
          console.log(`[download] fetching service=${service} identifier=${doc.identifier} name=${doc.name}`);
          const result = await adapter.fetchDocument(doc.identifier, credential);
          console.log(`[download] success service=${service} identifier=${doc.identifier} ext=${result.ext}`);
          return { doc, result };
        })
      );

      docResults.forEach((r, i) => {
        const doc = docs[i];
        if (r.status === "fulfilled") {
          const { result } = r.value;
          entries.push({
            folder: service,
            filename: `${doc.name}.${result.ext}`,
            data: result.data,
          });
          manifest.push({ name: doc.name, ...(result.metadata ?? {}) });
        } else {
          console.error(`[download] failed service=${service} identifier=${doc.identifier}`, r.reason);
          manifest.push({ name: doc.name });
        }
      });

      return { service, entries, manifest };
    })
  );

  const entries: ZipEntry[] = [];
  for (const r of adapterResults) {
    if (r.status !== "fulfilled") continue;
    const { service, entries: svcEntries, manifest } = r.value;
    entries.push(...svcEntries);
    if (manifest.length) {
      entries.push({
        folder: service,
        filename: "manifest.tsv",
        data: buildManifestTsv(manifest),
      });
    }
  }

  const errors = adapterResults
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message ?? "Unknown error");

  if (entries.length === 0) {
    return NextResponse.json({ error: "Semua request gagal", details: errors }, { status: 500 });
  }

  const date = new Date().toISOString().slice(0, 10);
  const zipBuffer = await buildZip(entries);

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="bulk_download_${date}.zip"`,
      "X-Partial-Errors": errors.length ? JSON.stringify(errors) : "",
    },
  });
}
