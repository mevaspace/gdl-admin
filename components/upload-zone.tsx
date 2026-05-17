"use client";

import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFile(file: File): void;
}

export function UploadZone({ onFile }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");

  const handleFile = useCallback(
    (file: File) => {
      setFilename(file.name);
      onFile(file);
    },
    [onFile]
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <label
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-10 cursor-pointer transition-colors",
        dragging
          ? "border-[hsl(var(--primary))] bg-[hsl(var(--accent))]"
          : "border-[hsl(var(--border))] hover:border-[hsl(var(--muted-foreground))]"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <UploadCloud size={28} className="text-[hsl(var(--muted-foreground))]" />
      <div className="text-center">
        {filename ? (
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{filename}</p>
        ) : (
          <>
            <p className="text-sm text-[hsl(var(--foreground))]">Drop file Excel di sini</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">atau klik untuk pilih file</p>
          </>
        )}
      </div>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={onInputChange}
        className="sr-only"
      />
    </label>
  );
}
