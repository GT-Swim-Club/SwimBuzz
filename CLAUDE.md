# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SwimBuzz — team management app for Georgia Tech Swim Club (roster, practices, meets, results import, relay lineups). A pnpm/Turborepo monorepo:

- `apps/web` — Next.js 16 app that hosts **both** the full web UI and the `/api/*` backend
- `apps/mobile` — Expo/React Native app (Expo Router) for athletes and coaches, iOS & Android
- `packages/shared`, `packages/api`, `packages/tokens`, `packages/ui` — code shared between web and mobile

Mobile is a full client of the same `apps/web` `/api/*` backend, not a wrapper around the website — most features must be implemented once in the API and consumed from both web components and mobile screens.

## Commands

Run from the repo root (uses turbo filters under the hood):

```bash
pnpm install
pnpm db:generate          # prisma generate
pnpm db:push              # prisma db push (schema -> DB, no migrations)
pnpm dev:web              # apps/web on http://localhost:3000 (via apps/web/server.js)
pnpm dev:mobile           # Expo dev server for apps/mobile
pnpm build                # turbo run build (all packages)
pnpm build:web            # build @swimbuzz/web only
pnpm lint                 # turbo run lint (all packages)
```

Filter turbo to one package directly when iterating on just web or mobile, e.g. `pnpm --filter @swimbuzz/web exec prisma studio` or `pnpm --filter @swimbuzz/mobile lint`.

There is no test suite in this repo currently.

### apps/web specifics

- `pnpm --filter @swimbuzz/web exec prisma db push` — push schema changes (no migration files are used; the schema is pushed directly)
- `pnpm --filter @swimbuzz/web exec prisma studio` — inspect the DB
- `pnpm --filter @swimbuzz/web run backfill-slugs` — one-off data backfill script (`apps/web/scripts/backfill-slugs.mjs`)
- Local dev runs through `apps/web/server.js` (not stock `next dev`) so the in-process signup-monitor/notification-cleanup crons run alongside the app. Production on Vercel uses `next build`/`next start` and Vercel Cron instead (see Deployment below).
- After editing `apps/web/prisma/schema.prisma`, also check `apps/web/supabase/*.sql` — some features (storage buckets, RLS policies, one-off migrations) are applied as raw SQL there, not through Prisma.

### apps/mobile specifics

- `apps/mobile/AGENTS.md` / `apps/mobile/CLAUDE.md` flag that Expo has changed significantly — read https://docs.expo.dev/versions/v57.0.0/ before writing Expo/React Native code rather than relying on older training data.
- Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (not `localhost`) so a physical device/simulator can reach the API.

## Architecture

### Auth

Two parallel session mechanisms resolved by a single entry point, `getSession()` in [apps/web/src/lib/session.ts](apps/web/src/lib/session.ts):

- **Web**: NextAuth cookie/JWT session (Google OAuth or `@gatech.edu` email OTP via Resend).
- **Mobile**: `Authorization: Bearer <accessToken>` JWT signed/verified in [apps/web/src/lib/mobile-auth.ts](apps/web/src/lib/mobile-auth.ts), obtained/refreshed through `/api/auth/mobile/*` (`MobileRefreshToken` model), independent of NextAuth cookies.

`getSession()` checks for a Bearer token first, then falls back to the NextAuth cookie — so most API routes and server code should call `getSession()` rather than `getServerSession` directly to work for both clients. CORS for the mobile app's cross-origin requests is handled by [apps/web/src/lib/cors.ts](apps/web/src/lib/cors.ts) (`withCors`/`optionsCors`).

Roles: `ATHLETE`, `COACH`, `EXEC` (Prisma `Role` enum). `isStaffRole()` in `@swimbuzz/shared` (and duplicated locally in `apps/web/src/lib/auth-roles.ts`) treats `COACH`/`EXEC` as staff for permission checks.

### API surface

All backend logic lives under `apps/web/src/app/api/**` as Next.js route handlers — this is the only backend; mobile and web both call it. Business logic is generally factored out into `apps/web/src/lib/*.ts` modules (one concern per file: `meet-*`, `practice-*`, `roster-*`, `swim-*`, `scraper-*`, `notifications.ts`, `push.ts`, etc.) with the route handler itself staying thin.

Notable subsystems:
- **Meets**: import/parsing pipeline for SwimCloud/SwimPhone/PDF packets and sheets (`meet-import*.ts`, `meet-packet-parse.ts`, `meet-sheet-*.ts`), signup forms, room assignment, and an "optimal relays" solver (`/api/relays/optimal`).
- **Practices**: TipTap-authored plans with per-practice edit locking so two coaches can't clobber each other — see `practice-edit-lock*.ts` (lock acquire/heartbeat/yield/watch split across files) — plus attendance (`practice-attendance.ts`) and tagging (`practice-tags.ts`, `practice-tag-catalog.ts`).
- **Run scraper**: a desktop Python + Playwright helper (source at `apps/web/public/scraper/`, served as a static download) that runs on a coach's machine to scrape SwimCloud/SwimPhone/parse PDFs, since Vercel can't run a headless browser. It pairs with the web app (`/api/scraper/pairing`, `register`, `heartbeat`), enqueues jobs the web app polls (`/api/scraper/jobs/[id]`, `ScraperJob` model), and both web and mobile coaches can trigger/watch these jobs — only the actual scraping happens off-server.
- **Notifications**: in-app `Notification` model plus Expo push via `DevicePushToken` (`push.ts`, `/api/devices/push-token`); cleanup and the meet-signup monitor run as crons — in-process in `server.js` locally, via Vercel Cron / an external minutely cron in production (`cron-auth.ts` validates `CRON_SECRET`).
- **Storage**: Supabase Storage for meet files and avatars (`avatar-storage.ts`, `meet-storage.ts`), not local disk — required for Vercel's ephemeral filesystem. Vercel also caps request bodies (~4.5MB); large files must go through Supabase Storage or a fetched URL, not raw multipart upload.

### Prisma / database

Single schema at `apps/web/prisma/schema.prisma`, Postgres (Supabase). Two connection strings: `DATABASE_URL` (transaction pooler, port 6543, used by the app) and `DIRECT_URL` (direct/session, port 5432, used only for `prisma db push`/migrations). No migration files are checked in — schema changes are applied with `prisma db push`, and structural changes that Prisma can't express (storage buckets, RLS, backfills) live as raw SQL under `apps/web/supabase/`.

Prisma client is a singleton at `apps/web/src/lib/prisma.ts` (see also `apps/web/prisma-singleton.js` for the custom server) to avoid exhausting connections in dev/hot-reload and serverless.

### Shared packages

Edit these together with both `apps/web` and `apps/mobile` in mind — they're the contract between the two clients:

- `@swimbuzz/shared` — `Role`/`isStaffRole` helpers, DTO-ish summary types, formatters (`format.ts`), HTML sanitization/rendering helpers (`html.ts`) shared between the web TipTap output and mobile's `FormattedText`.
- `@swimbuzz/api` — `createApiClient(options)`: a single typed fetch client used by both apps. Web calls it with no `baseUrl` (same-origin `/api/...`, cookie auth); mobile passes `baseUrl` = `EXPO_PUBLIC_API_URL` and a `getAccessToken` callback (Bearer auth) plus `onUnauthorized`.
- `@swimbuzz/tokens` — brand colors/spacing as the source of truth (`colors.css` for web, consumed via `variablesFor()` on mobile).
- `@swimbuzz/ui` — shared React Native UI primitives (Button, ListRow, Section, etc.) used across mobile screens.

### Brand colors (enforced convention)

Never hardcode `#hex`/`rgb()`/named colors in components or styles — use the `--brand-color-*` tokens

- **Web**: defined in `apps/web/src/app/variables.css` (`:root` + `.dark`), consumed via `var(--brand-color-text)` or the mapped `--color-*` names in `globals.css`.
- **Mobile**: defined in `apps/mobile/src/lib/variables.ts`, consumed via `variablesFor(scheme)["--brand-color-text"]` or theme helpers wrapping it.

If no existing token fits, add a new `--brand-color-<name>` in both `variables.css` (light + dark) and `packages/tokens` (`colors.light`/`colors.dark`), then wire it into `variables.ts` and, if needed, `globals.css` — don't inline a one-off color.

## Deployment

- **Production**: Vercel, root directory = repo root (workspace packages must resolve), build command `pnpm --filter @swimbuzz/web run build`. See the README's Vercel section for required env vars (`DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET`, etc.), the Vercel Cron jobs, and the external-cron requirement for the once-a-minute signup monitor (Hobby plan can't run cron more often than daily).
- **Render**: legacy target, kept working but Vercel is preferred. Uses `apps/web/server.js` directly so crons run in-process.
- **Mobile**: EAS Build/Submit (`apps/mobile/eas.json`); `EXPO_PUBLIC_API_URL` must point at the deployed API origin.
