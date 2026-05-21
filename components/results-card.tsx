"use client";

import type { JobPart } from "@/lib/job-state";

interface ResultsCardProps {
  parts: JobPart[];
  done: number;
  total: number;
  failed: number;
  onDownloadAll: (parts: JobPart[]) => void;
}

export function ResultsCard({ parts, done, total, failed, onDownloadAll }: ResultsCardProps) {
  const sorted = [...parts].sort((a, b) => a.batchIndex - b.batchIndex);
  return (
    <div className="rounded-md border border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/5 px-4 py-4 text-sm space-y-3">
      <div className="space-y-0.5">
        <p className="text-base font-medium text-[hsl(var(--foreground))]">
          Selesai: {done}/{total}
          {failed > 0 && <span className="text-red-400"> · gagal {failed}</span>}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {parts.length} batch ZIP siap diunduh.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDownloadAll(parts)}
        className="w-full rounded-md bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
      >
        Unduh Semua ({parts.length} ZIP)
      </button>
      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
        Browser mungkin minta izin untuk multiple download. Klik &ldquo;Allow&rdquo;.
      </p>
      <div className="space-y-1 pt-1 border-t border-[hsl(var(--border))]">
        <p className="text-xs text-[hsl(var(--muted-foreground))] pt-2">Atau unduh per batch:</p>
        <ul className="space-y-1">
          {sorted.map((p) => (
            <li key={p.batchIndex}>
              <a
                href={p.blobUrl}
                target="_blank"
                rel="noopener"
                className="text-xs underline text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                part-{String(p.batchIndex).padStart(3, "0")}.zip ({p.count} dok
                {p.failed > 0 ? ` · ${p.failed} gagal` : ""})
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
