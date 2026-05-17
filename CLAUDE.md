# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@mevaspace/gdl-admin` — web app internal bulk download dokumen logistik (AWB, BTB) dari partner 3PL. User upload Excel berisi daftar dokumen, app fetch dari API masing-masing 3PL, return ZIP.

## Tech Stack

| Layer | Pilihan |
|---|---|
| Framework | Next.js (App Router, latest) |
| UI | shadcn/ui + Tailwind CSS — dark theme default, tanpa toggle |
| Auth | JWT di httpOnly cookie, user list dari env `VALID_USERS` |
| Excel parsing | SheetJS (`xlsx`) — client-side |
| ZIP generation | JSZip — server-side di API Route |
| Deploy | Vercel (target Pro tier untuk 60s timeout) |
| Package manager | pnpm |
| Node | via `mise` |

## Environment Variables

```env
# JSON array username + bcrypt-hashed password
VALID_USERS='[{"username":"admin","passwordHash":"$2b$10$..."}]'
JWT_SECRET="your-secret-here"

# Opsional per-3PL base URL
JNE_API_BASE_URL="https://..."
SICEPAT_API_BASE_URL="https://..."
```

## Project Structure

```
/app
  /login              → halaman auth
  /dashboard          → halaman utama
  /api/auth           → validasi login, return JWT
  /api/download       → fetch ke 3PL API, return ZIP
/components
  /credential-form    → form input credential per-3PL (disimpan ke sessionStorage)
  /upload-zone        → drag & drop upload Excel
/lib
  /3pl/[nama].ts      → modul integrasi per-partner (1 file per 3PL)
  /zip.ts             → helper ZIP generation
  /auth.ts            → JWT helper
middleware.ts         → proteksi route, validasi JWT cookie
```

## Application Flow

1. **Login** → `/api/auth` validasi against `VALID_USERS` env → JWT di httpOnly cookie
2. **Credential Setup** → user input credential tiap 3PL → simpan ke `sessionStorage` (bukan server, hilang saat tab tutup)
3. **Upload Excel** → Col A: `document_code`, Col B: `service` (nama 3PL) → parse client-side via SheetJS → group per-3PL
4. **Download** → kirim ke `/api/download` (credential + daftar dokumen) → fetch paralel ke 3PL API → ZIP → return ke user

## Output ZIP Structure

```
bulk_download_YYYY-MM-DD.zip
├── JNE/
│   └── JNE-0012345.pdf
├── SiCepat/
│   └── SCP-9988771.pdf
└── JT/
    └── JT-00456.pdf
```

## Development Priority

1. Auth (login page + JWT validation)
2. Dashboard skeleton + credential form
3. Excel upload & parsing
4. Integrasi 3PL pertama end-to-end
5. ZIP generation & download
6. Tambah 3PL berikutnya

## Key Constraints

- `export const maxDuration = 60` di `/api/download` (Vercel Pro — Hobby max 10s)
- Credential 3PL **tidak pernah** disimpan di server, hanya `sessionStorage`
- Modul 3PL di `/lib/3pl/[nama].ts` — modular, mudah tambah partner baru
- shadcn/ui install komponen via CLI: `pnpm dlx shadcn@latest add [component]`

## Next.js 16 Notes

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
