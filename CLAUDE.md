# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@mevaspace/gdl-admin` — web app internal bulk download dokumen logistik (AWB, BTB) dari partner 3PL. User upload Excel berisi daftar dokumen, app fetch dari API masing-masing 3PL, return ZIP.

## Tech Stack

| Layer | Pilihan |
|---|---|
| Framework | Next.js 19 (App Router) |
| UI | shadcn/ui + Tailwind CSS v4 — dark theme default, tanpa toggle |
| Auth | JWT (jose) di httpOnly cookie, user list dari env `VALID_USERS_B64` |
| Password | bcryptjs |
| Excel parsing | SheetJS (`xlsx`) — client-side |
| ZIP generation | JSZip — server-side di API Route |
| Browser/render | puppeteer-core + @sparticuz/chromium (prod), puppeteer full (dev) |
| Deploy | Vercel (target Pro tier untuk 60s timeout) |
| Package manager | pnpm |
| Node | via `mise` |

## Environment Variables

```env
# Base64-encoded JSON array: [{"username":"admin","passwordHash":"$2b$10$..."}]
VALID_USERS_B64="<base64>"
JWT_SECRET="your-secret-here"

# Upstash QStash
QSTASH_TOKEN="<token>"
QSTASH_CURRENT_SIGNING_KEY="<key>"
QSTASH_NEXT_SIGNING_KEY="<key>"

# Upstash Redis (REST)
UPSTASH_REDIS_REST_URL="<url>"
UPSTASH_REDIS_REST_TOKEN="<token>"

# Vercel Blob
BLOB_READ_WRITE_TOKEN="<token>"

# Base URL untuk QStash callback (production: https://your-app.vercel.app, dev: ngrok/tunnel)
APP_URL="<url>"

# Optional: ukuran batch per worker call (default 30)
JOB_BATCH_SIZE="30"
```

Generate hash: `node -e "const b=require('bcryptjs');b.hash('pass',10).then(console.log)"`
Generate base64: `echo '[{"username":"admin","passwordHash":"..."}]' | base64`

## Project Structure

```
/app
  /login              → halaman auth
  /dashboard          → halaman utama
  /api/auth           → validasi login, return JWT (8h expiry)
  /api/jobs/create    → terima docs+credentials, simpan state, enqueue ke QStash, return jobId
  /api/jobs/worker    → target QStash, verify signature, eksekusi fetch+zip+blob
  /api/jobs/[id]      → GET status job (polling endpoint)
/components
  /credential-form    → collapsible form credential per-3PL (sessionStorage)
  /upload-zone        → drag & drop upload Excel
/lib
  /3pl/
    types.ts          → ThreePLAdapter interface, DocumentRequest type
    ias.ts            → IAS adapter: AWB → cargo_id → HTML report → PNG
  /auth.ts            → signToken, verifyToken (jose)
  /browser.ts         → getBrowser, htmlToPng (puppeteer singleton)
  /zip.ts             → buildZip (jszip)
  /utils.ts           → cn() classname merger
  /redis.ts           → Upstash Redis client singleton
  /qstash.ts          → QStash publisher + Receiver (signature verify)
  /jobs.ts            → job state ops + credential encrypt/decrypt (AES via JWT_SECRET)
/chromium-bin         → precompiled chromium artifacts (dev + prod)
proxy.ts              → Next.js proxy: auth guard, redirect ke /login
next.config.ts        → allowedDevOrigins, serverExternalPackages (chromium)
```

## Application Flow

1. **Login** → `/api/auth` validasi against `VALID_USERS_B64` env → JWT di httpOnly cookie
2. **Credential Setup** → user input credential tiap 3PL → simpan ke `sessionStorage` (hilang saat tab tutup)
3. **Upload Excel** → Col A: `name` (filename output), Col B: `identifier` (kode lookup ke 3PL), Col C: `service` (nama 3PL) → parse client-side via SheetJS → group per-3PL
4. **Create Job (batched)** → POST `/api/jobs/create` (credential + daftar dokumen) → server chunk docs jadi N batch (`JOB_BATCH_SIZE` default 30), simpan state hash + encrypted payload di Redis, batch-publish N message QStash `{ jobId, batchIndex }`, return `{ jobId, batchesTotal, batchSize }`
5. **Batch Worker** → QStash POST `/api/jobs/worker` per batch → verify signature → slice docs `[start, end)` → fetch paralel per service → ZIP partial → upload Blob `bulk/{date}/{jobId}/part-{idx}.zip` → atomic `HINCRBY` counter Redis → batch terakhir set `status:done`
6. **Polling** → client GET `/api/jobs/{id}` tiap 2s → state composed dari hash + `parts` list + `errors` list. Saat `done` → tampilkan list URL ZIP per batch (multi-link download)

### Job Output (Hobby Mode)
- Tidak ada single consolidated ZIP (hindari finalizer timeout 300s)
- Output = N partial ZIP, satu per batch. Client unduh terpisah
- Tiap part isi: `{service}/[name].{ext}` + `{service}/manifest.tsv` (manifest hanya untuk dokumen di batch itu)

## IAS Adapter Flow

`lib/3pl/ias.ts` — satu-satunya adapter terimplementasi:
1. POST `/main/advance_search/cargo` dengan AWB → dapat `cargo_id` + `chw` (chargeable weight)
2. GET `/report/btb_new/{cargoId}` → HTML report
3. `htmlToPng(html, "#report-content")` via puppeteer → PNG buffer
4. Return `metadata: { weight }` untuk manifest

## Manifest

Setiap service folder di ZIP berisi `manifest.tsv` — TSV `name\t<metadataKeys...>`. Kolom metadata digabung dari union semua key di `FetchedDocument.metadata`. Doc yang gagal tetap masuk manifest (kolom metadata kosong). Untuk IAS: kolom `weight` dari `chw`.

## Browser Service

`lib/browser.ts` — singleton puppeteer instance:
- **Dev**: full `puppeteer` + system Chrome
- **Prod**: `puppeteer-core` + `@sparticuz/chromium` dari `chromium-bin/`
- Reuse instance antar request (tidak spawn ulang per-request)

## Output ZIP Structure

```
bulk/{date}/{jobId}/
├── part-000.zip
│   ├── IAS/[name].png
│   └── IAS/manifest.tsv  (name\tweight) — hanya dokumen batch ini
├── part-001.zip
└── ...
```

## Key Constraints

- `export const maxDuration = 300` di `/api/jobs/worker` (Hobby max; Pro Fluid Compute bisa 800)
- `export const maxDuration = 10` di `/api/jobs/create` (cepat, cuma enqueue)
- Credential 3PL **tidak pernah** disimpan di server, hanya `sessionStorage`
- Modul 3PL di `/lib/3pl/[nama].ts` — modular, mudah tambah partner baru
- Tambah adapter baru: implement `ThreePLAdapter` interface dari `types.ts`
- shadcn/ui install komponen via CLI: `pnpm dlx shadcn@latest add [component]`

## Next.js 19 / Proxy Notes

- **Middleware** → **Proxy**: file `proxy.ts` (bukan `middleware.ts`), export function `proxy` (bukan `middleware`)
- `NextResponse` body harus `Uint8Array`, bukan `Buffer` langsung
- `matcher` config di `proxy.ts` tetap berlaku sama seperti middleware

## Commands

```bash
pnpm install          # install deps
pnpm dev              # dev server
pnpm build            # production build
pnpm lint             # lint
```
