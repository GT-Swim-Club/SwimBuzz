# SwimBuzz

Team management app for **Georgia Tech Swim Club** — roster, practices, meets, results import, relay lineups.

Web hosts both the UI and the API; mobile is a full client of that same API, not a wrapper around the website.

- **`apps/web`** — Next.js 16, hosts the UI **and** the `/api/*` backend
- **`apps/mobile`** — Expo / React Native app for athletes and coaches (iOS & Android)
- **`packages/*`** — code shared between web and mobile (roles/DTOs, API client, design tokens, RN UI primitives)
- **`pdf_parsers/`** + **`api/parse-pdf.py`** — server-side meet-PDF parsing (Vercel Python Function)

Auth: Google OAuth or `@gatech.edu` email OTP. Roles: `ATHLETE`, `COACH`, `EXEC`. Web uses NextAuth cookie/JWT sessions; mobile uses Bearer access/refresh tokens (`/api/auth/mobile/*`) — both resolve through the same `getSession()`.

## Onboarding checklist

**Prerequisites:** Node 22.19+, pnpm 9+, PostgreSQL (Supabase recommended), Python 3.11+ (PDF parsing locally, and for Run Scraper), Xcode/Android Studio for native builds.

- [ ] `pnpm install` (`brew install pnpm` on macOS if needed)
- [ ] `pip install -r requirements.txt` (pdfplumber, httpx — local PDF parsing)
- [ ] `cp .env.example apps/web/.env` and fill in values from someone who already has them — see comments in the file for where each one comes from:
  - [ ] `DATABASE_URL` / `DIRECT_URL` — Supabase Postgres (pooler port 6543 / direct port 5432)
  - [ ] `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (service_role, not anon) — Supabase → Settings → API
  - [ ] Create Storage buckets `meet-files` and `avatars`, then run `apps/web/supabase/meet-files-storage.sql` and `avatars-storage.sql`
  - [ ] `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL=http://localhost:3000`
  - [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google OAuth sign-in
  - [ ] `RESEND_API_KEY` for `@gatech.edu` OTP email — optional locally, the OTP code just logs to the server console without one
  - [ ] `CRON_SECRET` and `PDF_PARSER_SECRET` (`openssl rand -base64 32` each) — leave `PDF_PARSER_URL` unset locally
  - [ ] Only if touching Google Sheets roster import: enable both the Picker API and Sheets API in Google Cloud Console, set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`
- [ ] Apply any relevant raw SQL under `apps/web/supabase/` (storage buckets, RLS, one-off migrations — things `prisma db push` can't express)
- [ ] `pnpm db:generate`
- [ ] `pnpm --filter @swimbuzz/web exec prisma db push`
- [ ] `pnpm dev:web` → http://localhost:3000, sign in, confirm the dashboard loads
- [ ] `pnpm lint` to confirm a clean baseline before making changes

For mobile: `cp apps/mobile/.env.example apps/mobile/.env`, set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` to your machine's LAN IP (`ipconfig getifaddr en0` on macOS — not `localhost`), then `pnpm dev:mobile`. Google sign-in on mobile needs separate iOS/Android/Web OAuth client IDs and only works in dev builds (blocked in Expo Go). Read `apps/mobile/AGENTS.md`/`CLAUDE.md` before writing RN code — Expo has changed significantly since older training data; check https://docs.expo.dev/versions/v57.0.0/.

SwimCloud/SwimPhone syncing needs the **Run Scraper** desktop helper running on your machine (started from the web UI) — Cloudflare/rate-limit reasons require a real browser, so it can't run server-side. PDF imports (results, sheets, packets, NQT standards) parse server-side and need nothing installed; locally they shell out to `python3 -m pdf_parsers.cli`.

A repo-root `CLAUDE.md` with additional architecture/convention notes exists locally for Claude Code but is gitignored — ask a maintainer to share it if you're using Claude Code.

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

### Recently Deleted

Coaches and execs can open **Settings → Recently Deleted** on web and mobile (also linked from the web practice/meet toolbars). The shared recovery period defaults to 30 days and accepts 1–365 days. Changes apply to future deletions; each item keeps the deadline assigned when deleted.

- Practice deletion preserves sets, comments, attendance and publication state for recovery; edit locks are released.
- **Delete meet only** preserves swims in athlete stats, including after permanent cleanup.
- **Delete meet and swims** hides swims from stats until restoration, or permanently removes them with the meet at expiry.
- **Delete swims only** remains permanent. Recovery applies to deleted practices and meets, not individual swim removals.

Apply `apps/web/supabase/soft-delete-recovery.sql` (or `pnpm db:push`) before deploying this code, then generate Prisma. No existing rows need a backfill. The existing daily `/api/cron/notification-cleanup` cron also purges expired items. Recovery closes at the displayed deadline; physical cleanup happens on the next daily run (25 meets per run). Failed storage cleanup retains the meet and URLs for retry, and restoration is blocked once purge has begun. The custom server schedules the same authenticated endpoint locally; it generates a process-local cron secret if `CRON_SECRET` is absent.

Active-record filtering is installed on the shared Prisma client, including nested lists and counts. Recovery and slug reservation use the narrowly scoped `withDeleted` context. Raw SQL and separate `PrismaClient` instances bypass this policy; use the shared client for application queries.

Run `pnpm --filter @swimbuzz/web test:recovery` for isolated database behavior checks (SQLite fixture; no production connection or storage access). Web and mobile TypeScript checks validate the shared API contract.
