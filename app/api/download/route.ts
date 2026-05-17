import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { buildZip } from "@/lib/zip";
import type { DocumentRequest, ThreePLCredential } from "@/lib/3pl/types";

// Vercel Pro: 60s timeout
export const maxDuration = 60;

interface DownloadRequestBody {
  documents: DocumentRequest[];
  credentials: Record<string, ThreePLCredential>;
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

  // Load adapters dynamically
  const adapterResults = await Promise.allSettled(
    Object.entries(grouped).map(async ([service, docs]) => {
      const credential = credentials[service];
      if (!credential) throw new Error(`Credential untuk ${service} tidak ditemukan`);

      const adapterModule = await import(`@/lib/3pl/${service.toLowerCase()}`).catch(() => {
        throw new Error(`Adapter untuk ${service} belum tersedia`);
      });

      const adapter = adapterModule.default;
      return Promise.all(
        docs.map(async (doc) => {
          const result = await adapter.fetchDocument(doc.code, credential);
          return {
            folder: service,
            filename: `${doc.code}.${result.ext}`,
            data: result.data,
          };
        })
      );
    })
  );

  type ZipEntryResult = { folder: string; filename: string; data: Buffer }[];
  const entries = (
    adapterResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<ZipEntryResult>).value)
      .flat()
  );

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
