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
```

Generate hash: `node -e "const b=require('bcryptjs');b.hash('pass',10).then(console.log)"`
Generate base64: `echo '[{"username":"admin","passwordHash":"..."}]' | base64`

## Project Structure

```
/app
  /login              → halaman auth
  /dashboard          → halaman utama
  /api/auth           → validasi login, return JWT (8h expiry)
  /api/download       → fetch ke 3PL API, return ZIP
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
/chromium-bin         → precompiled chromium artifacts (dev + prod)
proxy.ts              → Next.js proxy: auth guard, redirect ke /login
next.config.ts        → allowedDevOrigins, serverExternalPackages (chromium)
```

## Application Flow

1. **Login** → `/api/auth` validasi against `VALID_USERS_B64` env → JWT di httpOnly cookie
2. **Credential Setup** → user input credential tiap 3PL → simpan ke `sessionStorage` (hilang saat tab tutup)
3. **Upload Excel** → Col A: `name` (filename output), Col B: `identifier` (kode lookup ke 3PL), Col C: `service` (nama 3PL) → parse client-side via SheetJS → group per-3PL
4. **Download** → POST ke `/api/download` (credential + daftar dokumen) → dynamic `import(@/lib/3pl/[service])` → fetch paralel → ZIP → return ke user

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
bulk_download_YYYY-MM-DD.zip
├── IAS/
│   ├── [name].png
│   └── manifest.tsv      (name\tweight)
└── [service]/
    ├── [name].[ext]
    └── manifest.tsv
```

## Key Constraints

- `export const maxDuration = 60` di `/api/download` (Vercel Pro — Hobby max 10s)
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
