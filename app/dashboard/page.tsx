"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { read, utils, write } from "xlsx";
import { CredentialForm } from "@/components/credential-form";
import { UploadZone } from "@/components/upload-zone";
import { PrimaryActionButton } from "@/components/primary-action-button";
import { ProgressCard } from "@/components/progress-card";
import { ResultsCard } from "@/components/results-card";
import type { DocumentRequest } from "@/lib/3pl/types";
import type { JobPart, JobView } from "@/lib/job-state";
import logo from "@/assets/logo.webp";

const SUPPORTED_SERVICES = ["IAS"] as const;
const POLL_INTERVAL_MS = 2000;

interface ParsedRow {
  name: string;
  identifier: string;
  service: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [documents, setDocuments] = useState<DocumentRequest[]>([]);
  const [parseError, setParseError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  function handleCredentialSave(service: string, cred: Record<string, string>) {
    setCredentials((prev) => ({ ...prev, [service]: cred }));
  }

  const handleFile = useCallback((file: File) => {
    setParseError("");
    setDocuments([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = read(e.target?.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = utils.sheet_to_json<ParsedRow>(sheet, {
          header: ["name", "identifier", "service"],
          range: 1,
          defval: "",
        });

        const valid = rows.filter((r) => r.name && r.identifier && r.service);
        if (!valid.length) {
          setParseError("File tidak berisi data valid. Pastikan Col A = name, Col B = identifier, Col C = 3PL type.");
          return;
        }

        setDocuments(valid.map((r) => ({
          name: String(r.name).trim(),
          identifier: String(r.identifier).trim(),
          service: String(r.service).trim(),
        })));
      } catch {
        setParseError("Gagal membaca file. Pastikan format Excel (.xlsx/.xls).");
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  async function pollJob(jobId: string) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDownloadError(data.error ?? "Gagal cek status job");
        setDownloading(false);
        return;
      }
      const data: JobView = await res.json();
      setJob(data);

      if (data.status === "done") {
        setDownloading(false);
        return;
      }
      if (data.status === "failed") {
        setDownloading(false);
        setDownloadError(data.errors?.[0] ?? "Job gagal");
        return;
      }
      pollTimer.current = setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
    } catch {
      setDownloadError("Koneksi terputus saat polling status");
      setDownloading(false);
    }
  }

  async function handleDownload() {
    if (!documents.length) return;
    if (job?.status === "done" || job?.status === "failed") {
      setJob(null);
      setDownloadError("");
      return;
    }
    setDownloadError("");
    setJob(null);
    setDownloading(true);

    const neededServices = [...new Set(documents.map((d) => d.service))];
    const missing = neededServices.filter((s) => !credentials[s]);
    if (missing.length) {
      setDownloadError(`Credential belum diisi untuk: ${missing.join(", ")}`);
      setDownloading(false);
      return;
    }

    try {
      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, credentials }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDownloadError(data.error ?? "Gagal membuat job");
        setDownloading(false);
        return;
      }

      const { jobId, batchesTotal, batchSize } = (await res.json()) as {
        jobId: string;
        batchesTotal: number;
        batchSize: number;
      };
      setJob({
        id: jobId,
        status: "pending",
        total: documents.length,
        done: 0,
        failed: 0,
        batchSize,
        batchesTotal,
        batchesCompleted: 0,
        parts: [],
        errors: [],
      });
      pollJob(jobId);
    } catch {
      setDownloadError("Tidak bisa terhubung ke server");
      setDownloading(false);
    }
  }

  function handleDownloadTemplate() {
    const ws = utils.aoa_to_sheet([
      ["name", "identifier", "service"],
      ["contoh_awb_001", "1234567890", "IAS"],
    ]);
    ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 12 }];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Documents");
    const buf = write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gdl_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadAll(parts: JobPart[]) {
    const sorted = [...parts].sort((a, b) => a.batchIndex - b.batchIndex);
    sorted.forEach((p, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = p.blobUrl;
        a.download = `part-${String(p.batchIndex).padStart(3, "0")}.zip`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  }

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  const serviceGroups = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.service] = (acc[d.service] ?? 0) + 1;
    return acc;
  }, {});

  const jobActive = job?.status === "pending" || job?.status === "processing";
  const busy = downloading || jobActive;
  const buttonLabel = (() => {
    if (!documents.length) return "Proses 0 dokumen";
    if (job?.status === "pending") return "Menunggu QStash...";
    if (job?.status === "processing") return `Memproses ${job.done + job.failed}/${job.total}...`;
    if (job?.status === "done") return "Proses job baru";
    if (job?.status === "failed") return "Coba lagi";
    if (downloading) return "Memproses...";
    return `Proses ${documents.length} dokumen`;
  })();
  const isPrimaryFilled = !(job?.status === "done" || job?.status === "failed");

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src={logo} alt="GDL Logo" height={40} className="w-auto" />
          <div>
            <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">GDL Admin</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Bulk Download Dokumen Logistik</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          Logout
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {/* Credential Setup */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-[hsl(var(--foreground))]">Credential 3PL</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Disimpan di sesi ini saja. Akan hilang saat tab ditutup.
            </p>
          </div>
          <div className="space-y-3">
            {SUPPORTED_SERVICES.map((service) => (
              <CredentialForm
                key={service}
                service={service}
                active={!!credentials[service]}
                onSave={(cred) => handleCredentialSave(service, cred)}
              />
            ))}
          </div>
        </section>

        {/* Upload Excel */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-[hsl(var(--foreground))]">Upload Excel</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Col A: name &nbsp;|&nbsp; Col B: identifier &nbsp;|&nbsp; Col C: 3PL type
            </p>
          </div>
          <UploadZone onFile={handleFile} />
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="text-xs text-[hsl(var(--muted-foreground))] underline-offset-2 hover:text-[hsl(var(--foreground))] hover:underline transition-colors"
          >
            Download template Excel
          </button>
          {parseError && <p className="text-sm text-red-400">{parseError}</p>}
          {documents.length > 0 && (
            <div className="rounded-md border border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--foreground))] space-y-1">
              <p className="font-medium">{documents.length} dokumen siap diunduh</p>
              {Object.entries(serviceGroups).map(([svc, count]) => (
                <p key={svc} className="text-[hsl(var(--muted-foreground))]">
                  {svc}: {count} dokumen
                </p>
              ))}
            </div>
          )}
        </section>

        {/* Download */}
        <section className="space-y-3">
          {downloadError && <p className="text-sm text-red-400">{downloadError}</p>}

          {job && jobActive && <ProgressCard job={job} />}

          {job?.status === "done" && job.parts.length > 0 && (
            <ResultsCard
              parts={job.parts}
              done={job.done}
              total={job.total}
              failed={job.failed}
              onDownloadAll={handleDownloadAll}
            />
          )}

          {job && job.errors.length > 0 && (
            <details className="text-xs text-[hsl(var(--muted-foreground))]">
              <summary className="cursor-pointer">Lihat {job.errors.length} error</summary>
              <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {job.errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="text-red-400">{e}</li>
                ))}
              </ul>
            </details>
          )}

          <PrimaryActionButton
            label={buttonLabel}
            variant={isPrimaryFilled ? "filled" : "outline"}
            onClick={handleDownload}
            disabled={busy || !documents.length}
          />
        </section>
      </main>
    </div>
  );
}
