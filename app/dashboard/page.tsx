"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { read, utils } from "xlsx";
import { CredentialForm } from "@/components/credential-form";
import { UploadZone } from "@/components/upload-zone";
import type { DocumentRequest } from "@/lib/3pl/types";

const SUPPORTED_SERVICES = ["IAS"] as const;

interface ParsedRow {
  document_code: string;
  service: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [documents, setDocuments] = useState<DocumentRequest[]>([]);
  const [parseError, setParseError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

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
          header: ["document_code", "service"],
          range: 1,
          defval: "",
        });

        const valid = rows.filter((r) => r.document_code && r.service);
        if (!valid.length) {
          setParseError("File tidak berisi data valid. Pastikan Col A = kode dokumen, Col B = nama 3PL.");
          return;
        }

        setDocuments(valid.map((r) => ({ code: String(r.document_code).trim(), service: String(r.service).trim() })));
      } catch {
        setParseError("Gagal membaca file. Pastikan format Excel (.xlsx/.xls).");
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  async function handleDownload() {
    if (!documents.length) return;
    setDownloadError("");
    setDownloading(true);

    const neededServices = [...new Set(documents.map((d) => d.service))];
    const missing = neededServices.filter((s) => !credentials[s]);
    if (missing.length) {
      setDownloadError(`Credential belum diisi untuk: ${missing.join(", ")}`);
      setDownloading(false);
      return;
    }

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, credentials }),
      });

      if (!res.ok) {
        const data = await res.json();
        setDownloadError(data.error ?? "Download gagal");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bulk_download_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Tidak bisa terhubung ke server");
    } finally {
      setDownloading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  const serviceGroups = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.service] = (acc[d.service] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">GDL Admin</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Bulk Download Dokumen Logistik</p>
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
              Col A: kode dokumen &nbsp;|&nbsp; Col B: nama 3PL
            </p>
          </div>
          <UploadZone onFile={handleFile} />
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
          <button
            onClick={handleDownload}
            disabled={downloading || !documents.length}
            className="w-full rounded-md bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {downloading ? "Mengunduh..." : `Download ZIP (${documents.length} dokumen)`}
          </button>
        </section>
      </main>
    </div>
  );
}
