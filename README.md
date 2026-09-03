# SwimBuzz

Team management app for **Georgia Tech Swim Club**. Track rosters, plan practices, run meets, import results, and build relay lineups.

Built as a **pnpm / Turborepo monorepo**:

- **`apps/web`** — Next.js 16 web app (API host + full UI)
- **`apps/mobile`** — Expo / React Native app for athletes **and** coaches (iOS & Android)
- **`packages/*`** — shared types, API client, design tokens, UI primitives

## Features

### Athletes (web + mobile)

- Browse the roster by gender and season
- View personal bests and swim history on athlete profiles
- Meets — resources, travel, signup, rooms, sheets summaries, photos, live stream links
- Practices — published plans with comments
- Nationals / NQT standards
- In-app notifications with deep links (mobile also registers for Expo push)
- Profile: nicknames, SwimCloud ID requests, notification preferences

### Coaches & exec (web + mobile)

- **Roster** — Add athletes, approve profile changes, add/delete swims, sync SwimCloud times (mobile); CSV/SwimCloud import + scraper-assisted flows (web)
- **Meets** — Create/edit meets, travel, signup, room assign/publish, optimal relays (mobile); packet/sheet uploads, import results, full relay editor (web) — PDF imports parse server-side, no scraper needed
- **Practices** — Create, edit sets, publish, delete (mobile); TipTap editor + edit locks (web)
- **Qualifiers** — Nationals NQT tracking; PDF standards upload parses server-side, no scraper needed
- **Run scraper** — Desktop Python + Playwright helper for SwimCloud/SwimPhone browser scraping only (web UI only; mobile uses the same APIs once jobs complete)

Mobile is a full client of the same `/api/*` backend — it does **not** hand off to the website for core flows. External URLs (PDFs, live streams, maps) still open outside the app.

### Auth & roles

Google OAuth and Georgia Tech email OTP (`@gatech.edu`), roles: `ATHLETE`, `COACH`, `EXEC`.

- **Web:** NextAuth cookie/JWT sessions
- **Mobile:** Bearer access JWT + refresh tokens (`/api/auth/mobile/*`); email OTP + optional Google ID token (`expo-auth-session`)

## Project structure

```
SwimBuzz/
├── apps/
│   ├── web/                 # Next.js app (Render root directory)
│   └── mobile/              # Expo React Native app
├── packages/
│   ├── shared/              # roles, DTOs, formatters
│   ├── api/                 # typed createApiClient()
│   ├── tokens/              # brand colors / spacing
│   └── ui/                  # React Native primitives (Button, ListRow, Section, …)
├── pdf_parsers/             # Meet-PDF parsers (results/sheets/packets/NQT), shared by api/parse-pdf.py
├── api/parse-pdf.py         # Vercel Python Function — server-side PDF parsing
├── requirements.txt         # Python deps for api/parse-pdf.py (no web framework — see CLAUDE.md)
├── package.json             # pnpm workspaces + turbo
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 22+
- pnpm 9+
- Python 3.11+ (for PDF parsing in local dev, and for Run scraper's SwimCloud/SwimPhone scraping)
- PostgreSQL (e.g. Supabase)
- Google OAuth + Resend (email OTP)
- Xcode / Android Studio (for native builds)

## Environment variables

Copy [`.env.example`](.env.example) to `apps/web/.env`.

For mobile, copy `apps/mobile/.env.example` to `apps/mobile/.env` and set:

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Web API origin — local LAN IP for devices (not `localhost`) |
| `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` | Optional Google sign-in client IDs (iOS / Android / web) |

## Setup

```bash
pnpm install
pnpm db:generate
pnpm --filter @swimbuzz/web exec prisma db push
pnpm dev:web          # http://localhost:3000
pnpm dev:mobile       # Expo (scan QR / iOS simulator)
```

Apply SQL in `apps/web/supabase/` as needed.

### Run scraper (required for SwimCloud/SwimPhone imports)

SwimCloud / SwimPhone syncing runs on **your computer** via **Run scraper** (started from the web app) — Cloudflare/rate-limit reasons require it. Mobile coaches can still trigger syncs and view results through the API. PDF imports (results, psych/heat/entries sheets, packets, NQT standards) parse server-side and need nothing installed — locally they run through a `python3 -m pdf_parsers.cli` subprocess (repo root `pip install -r requirements.txt`), in production through `api/parse-pdf.py`.

## Deploy

### Web (Vercel Hobby)

Clone the full monorepo. Create a Vercel project with **Root Directory = repository root** (`.`) so workspace packages resolve.

| Setting | Value |
|---------|-------|
| Root directory | `.` (repository root) |
| Install | `pnpm install --frozen-lockfile` (see [`vercel.json`](vercel.json)) |
| Build | `pnpm --filter @swimbuzz/web run build` |
| Framework | Next.js |
| Node | `22` |
| `NEXTAUTH_URL` | `https://swimbuzz.gtswimclub.com` |

**Environment:** copy from [`.env.example`](.env.example). Critical for serverless:

- `DATABASE_URL` — Supabase **transaction** pooler (`6543` + `pgbouncer=true`)
- `DIRECT_URL` — migrations only
- `CRON_SECRET` — shared secret for cron routes
- `PDF_PARSER_SECRET` — shared secret for `api/parse-pdf.py`
- `PDF_PARSER_URL` — the deployed function URL (e.g. `https://swimbuzz.gtswimclub.com/api/parse-pdf`); PDF imports fail without it in production

**Crons**

1. **Notification cleanup** — registered in `vercel.json` (daily). Hobby allows once/day only.
2. **Staff term expiry** — registered in `vercel.json` (daily). Demotes coach/exec accounts whose staff term (May–Apr, see `currentStaffTerm()`) has lapsed back to `ATHLETE` — see [`apps/web/src/lib/staff-term-expiry.ts`](apps/web/src/lib/staff-term-expiry.ts).
3. **Signup monitor** — Hobby cannot run minutely Vercel Cron. Point a free external cron (e.g. [cron-job.org](https://cron-job.org)) at:

   `GET https://swimbuzz.gtswimclub.com/api/cron/signup-monitor`  
   Header: `Authorization: Bearer <CRON_SECRET>`  
   Schedule: every 1 minute.

**Request body limit:** Vercel caps request bodies at ~4.5MB. Large PDFs must go through Supabase Storage (or URL fetch), not raw multipart past that limit — `api/parse-pdf.py` only ever fetches from an allowlisted Supabase Storage URL, never accepts raw bytes.

**Scraper jobs** (SwimCloud/SwimPhone only) enqueue immediately and the client polls `/api/scraper/jobs/[id]`, then calls `…/finalize`. Keep Run Scraper running on your computer during those imports. PDF imports return synchronously and don't touch the scraper.

After schema changes, run `prisma db push` (or apply SQL under `apps/web/supabase/`, including [`vercel-cutover.sql`](apps/web/supabase/vercel-cutover.sql) for signup monitor + scraper apply fields).

#### Cutover checklist

1. Deploy a Vercel **preview**, set env vars, run `prisma db push` against production DB.
2. Update Google OAuth redirect URIs / `NEXTAUTH_URL` for the preview host; smoke-test sign-in.
3. Smoke roster, practices, meets, notifications.
4. With Run Scraper connected: sync times, roster SwimCloud import, SwimPhone import. Separately, verify a meet PDF import works (needs `PDF_PARSER_URL`/`PDF_PARSER_SECRET`, not the scraper).
5. Hit signup-monitor cron manually once; configure external minutely cron.
6. Point `swimbuzz.gtswimclub.com` DNS / domain to Vercel; set production `NEXTAUTH_URL`.
7. Disable the Render service after traffic looks healthy.

### Web (Render — legacy)

Prefer Vercel for production. If still on Render:

| Setting | Value |
|---------|-------|
| Root directory | `.` (repository root) |
| Build | `pnpm install --frozen-lockfile && pnpm --filter @swimbuzz/web run build` |
| Start | `pnpm --filter @swimbuzz/web start` (stock `next start`) or `start:with-monitors` for in-process crons |
| `NODE_VERSION` | `22` |

Local `pnpm dev:web` still uses [`apps/web/server.js`](apps/web/server.js) so signup/cleanup monitors run without external cron.

### Mobile (EAS)

1. `cd apps/mobile && npx eas-cli login`
2. Create an EAS project and set `extra.eas.projectId` in `app.json`
3. `eas build --platform ios` / `eas build --platform android`
4. `eas submit` (see `eas.json`)
5. Ensure `EXPO_PUBLIC_API_URL` points at the Vercel (or custom domain) origin

## Shared packages (edit web + mobile together)

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
- **Scraping:** Run scraper (Python, Playwright) — SwimCloud/SwimPhone only
- **PDF parsing:** `api/parse-pdf.py`, a Vercel Python Function (Python, pdfplumber)
