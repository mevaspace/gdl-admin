import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getJob } from "@/lib/jobs";

export const maxDuration = 10;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get("token")?.value;
  try {
    await verifyToken(token ?? "");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });

  return NextResponse.json(job);
}
