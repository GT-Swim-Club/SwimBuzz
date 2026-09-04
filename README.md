# SwimBuzz

Team management app for **Georgia Tech Swim Club** — roster, practices, meets, results import, relay lineups.

Web hosts both the UI and the API; mobile is a full client of that same API, not a wrapper around the website.

- **`apps/web`** — Next.js 16, hosts the UI **and** the `/api/*` backend
- **`apps/mobile`** — Expo / React Native app for athletes and coaches (iOS & Android)
- **`packages/*`** — code shared between web and mobile (roles/DTOs, API client, design tokens, RN UI primitives)
- **`pdf_parsers/`** + **`api/parse-pdf.py`** — server-side meet-PDF parsing (Vercel Python Function)

Auth: Google OAuth or `@gatech.edu` email OTP. Roles: `ATHLETE`, `COACH`, `EXEC`. Web uses NextAuth cookie/JWT sessions; mobile uses Bearer access/refresh tokens (`/api/auth/mobile/*`) — both resolve through the same `getSession()`.

## Quick start

```bash
pnpm install
cp .env.example apps/web/.env       # fill in DB, auth, etc. — see comments in the file
pnpm db:generate
pnpm --filter @swimbuzz/web exec prisma db push
pnpm dev:web                        # http://localhost:3000
```

For mobile: `cp apps/mobile/.env.example apps/mobile/.env`, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (not `localhost`), then `pnpm dev:mobile`.

**Prerequisites:** Node 22+, pnpm 9+, PostgreSQL (e.g. Supabase), Python 3.11+ (PDF parsing locally, and for Run Scraper), Xcode/Android Studio for native builds.

SwimCloud/SwimPhone syncing needs the **Run Scraper** desktop helper running on your machine (started from the web UI) — Cloudflare/rate-limit reasons require a real browser, so it can't run server-side. PDF imports (results, sheets, packets, NQT standards) parse server-side and need nothing installed; locally they shell out to `python3 -m pdf_parsers.cli` (`pip install -r requirements.txt`).

Apply any raw SQL under `apps/web/supabase/` as needed (storage buckets, RLS, one-off migrations — things `prisma db push` can't express).

## Project structure

```
SwimBuzz/
├── apps/
│   ├── web/                 # Next.js app — UI + /api/* backend
│   │   └── src/
│   │       ├── app/         # routes (App Router) — pages + /api/**
│   │       ├── lib/         # business logic, grouped by domain
│   │       └── components/  # React components, grouped by domain
│   └── mobile/               # Expo React Native app
├── packages/
│   ├── shared/               # roles, DTOs, formatters
│   ├── api/                  # typed createApiClient()
│   ├── tokens/                # brand colors / spacing
│   └── ui/                    # React Native primitives
├── pdf_parsers/               # meet-PDF parsers, shared by api/parse-pdf.py
├── api/parse-pdf.py           # Vercel Python Function — server-side PDF parsing
└── docs/DEPLOY.md             # Vercel/Render/EAS deploy details, cron setup, cutover checklist
```

## Commands

```bash
pnpm dev:web / dev:mobile   # run one app
pnpm build / build:web      # build (all packages / web only)
pnpm lint                   # turbo run lint
pnpm db:push                # prisma db push (schema -> DB, no migration files)
```

Filter turbo to iterate on one package: `pnpm --filter @swimbuzz/web exec prisma studio`, `pnpm --filter @swimbuzz/mobile lint`, etc. There's no test suite currently.

## Shared packages

Edit these with both apps in mind — they're the contract between web and mobile.

| Package | Use |
|---------|-----|
| `@swimbuzz/shared` | Roles, DTOs, date/name helpers |
| `@swimbuzz/api` | `createApiClient` — cookie (web) or Bearer (mobile) |
| `@swimbuzz/tokens` | Brand colors and spacing |
| `@swimbuzz/ui` | Shared RN UI primitives |

## Tech stack

- **Web:** Next.js 16, React 19, Tailwind 4, Prisma 5, NextAuth v4
- **Mobile:** Expo Router, SecureStore, Expo Notifications, expo-auth-session
- **Database / storage:** Supabase Postgres + Storage
- **Scraping:** Run Scraper (Python, Playwright) — SwimCloud/SwimPhone only
- **PDF parsing:** `api/parse-pdf.py`, a Vercel Python Function (pdfplumber)

## Deploying

See [`docs/DEPLOY.md`](docs/DEPLOY.md) — Vercel (preferred) and Render setup, required env vars, cron jobs, and the production cutover checklist.
