"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
}

const SERVICE_FIELDS: Record<string, CredentialField[]> = {
  IAS: [
    {
      key: "cookie",
      label: "Cookie",
      type: "password",
      placeholder: "Paste cookie string dari browser (F12 → Network → Copy as cURL)",
    },
  ],
};

interface CredentialFormProps {
  service: string;
  active: boolean;
  onSave(credential: Record<string, string>): void;
}

export function CredentialForm({ service, active, onSave }: CredentialFormProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const fields = SERVICE_FIELDS[service] ?? [];

  function handleSave() {
    const allFilled = fields.every((f) => values[f.key]?.trim());
    if (!allFilled) return;
    onSave(values);
    setSaved(true);
    setOpen(false);
  }

  return (
    <div className="rounded-md border border-[hsl(var(--border))] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
      >
        <span className="flex items-center gap-2">
          {active && <CheckCircle2 size={14} className="text-green-500" />}
          {service}
          {active && !open && (
            <span className="text-xs font-normal text-green-500">— Aktif</span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="border-t border-[hsl(var(--border))] px-4 py-4 space-y-3">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-xs font-medium text-[hsl(var(--foreground))]">
                {field.label}
              </label>
              <input
                type={field.type}
                value={values[field.key] ?? ""}
                onChange={(e) => {
                  setSaved(false);
                  setValues((v) => ({ ...v, [field.key]: e.target.value }));
                }}
                placeholder={field.placeholder}
                className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={handleSave}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-opacity",
              "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
              "disabled:opacity-40"
            )}
            disabled={!fields.every((f) => values[f.key]?.trim())}
          >
            {saved ? "Tersimpan" : "Simpan"}
          </button>
        </div>
      )}
    </div>
  );
}
