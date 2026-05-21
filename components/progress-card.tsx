"use client";

import type { JobView } from "@/lib/job-state";

interface ProgressCardProps {
  job: Pick<JobView, "status" | "done" | "failed" | "total" | "batchesCompleted" | "batchesTotal">;
}

export function ProgressCard({ job }: ProgressCardProps) {
  const processed = job.done + job.failed;
  const pct = Math.min(100, Math.round((processed / Math.max(1, job.total)) * 100));
  return (
    <div className="rounded-md border border-[hsl(var(--border))] px-4 py-3 text-sm space-y-1.5">
      <p className="font-medium text-[hsl(var(--foreground))]">
        Status: <span className="text-[hsl(var(--muted-foreground))]">{job.status}</span>
      </p>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Dokumen {processed}/{job.total}
        {job.failed > 0 && <span className="text-red-400"> · gagal {job.failed}</span>}
        {" · "}batch {job.batchesCompleted}/{job.batchesTotal}
      </p>
      <div className="h-1.5 w-full rounded-full bg-[hsl(var(--border))] overflow-hidden">
        <div
          className="h-full bg-[hsl(var(--primary))] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
