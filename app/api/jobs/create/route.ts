import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { createJob } from "@/lib/jobs";
import { getQStashClient } from "@/lib/qstash";
import type { DocumentRequest, ThreePLCredential } from "@/lib/3pl/types";

export const maxDuration = 10;

interface CreateBody {
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

  const body: CreateBody = await req.json();
  const { documents, credentials } = body;
  if (!documents?.length) {
    return NextResponse.json({ error: "Tidak ada dokumen" }, { status: 400 });
  }

  const neededServices = [...new Set(documents.map((d) => d.service))];
  const missing = neededServices.filter((s) => !credentials?.[s]);
  if (missing.length) {
    return NextResponse.json({ error: `Credential belum diisi untuk: ${missing.join(", ")}` }, { status: 400 });
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "APP_URL env belum di-set" }, { status: 500 });
  }

  const jobId = await createJob({ documents, credentials });

  try {
    await getQStashClient().publishJSON({
      url: `${appUrl.replace(/\/$/, "")}/api/jobs/worker`,
      body: { jobId },
      retries: 3,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gagal enqueue ke QStash", detail: String(err) },
      { status: 502 },
    );
  }

  return NextResponse.json({ jobId });
}
