# Deployment

## Web (Vercel — preferred)

Clone the full monorepo. Create a Vercel project with **Root Directory = repository root** (`.`) so workspace packages resolve.

| Setting | Value |
|---------|-------|
| Root directory | `.` (repository root) |
| Install | `pnpm install --frozen-lockfile` (see [`vercel.json`](../vercel.json)) |
| Build | `pnpm --filter @swimbuzz/web run build` |
| Framework | Next.js |
| Node | `22` |
| `NEXTAUTH_URL` | `https://swimbuzz.gtswimclub.com` |

**Environment:** copy from [`.env.example`](../.env.example). Critical for serverless:

- `DATABASE_URL` — Supabase **transaction** pooler (`6543` + `pgbouncer=true`)
- `DIRECT_URL` — migrations only
- `CRON_SECRET` — shared secret for cron routes
- `PDF_PARSER_SECRET` — shared secret for `api/parse-pdf.py`
- `PDF_PARSER_URL` — the deployed function URL (e.g. `https://swimbuzz.gtswimclub.com/api/parse-pdf`); PDF imports fail without it in production

**Request body limit:** Vercel caps request bodies at ~4.5MB. Large PDFs must go through Supabase Storage (or URL fetch), not raw multipart past that limit — `api/parse-pdf.py` only ever fetches from an allowlisted Supabase Storage URL, never accepts raw bytes.

### Crons

1. **Notification cleanup** — registered in `vercel.json` (daily). Hobby allows once/day only.
2. **Staff term expiry** — registered in `vercel.json` (daily). Demotes coach/exec accounts whose staff term (May–Apr, see `currentStaffTerm()`) has lapsed back to `ATHLETE` — see [`apps/web/src/lib/staff-term-expiry.ts`](../apps/web/src/lib/staff-term-expiry.ts).
3. **Signup monitor** — Hobby cannot run minutely Vercel Cron. Point a free external cron (e.g. [cron-job.org](https://cron-job.org)) at:

   `GET https://swimbuzz.gtswimclub.com/api/cron/signup-monitor`
   Header: `Authorization: Bearer <CRON_SECRET>`
   Schedule: every 1 minute.

**Scraper jobs** (SwimCloud/SwimPhone only) enqueue immediately and the client polls `/api/scraper/jobs/[id]`, then calls `…/finalize`. Keep Run Scraper running on your computer during those imports. PDF imports return synchronously and don't touch the scraper.

After schema changes, run `prisma db push` (or apply SQL under `apps/web/supabase/`, including [`vercel-cutover.sql`](../apps/web/supabase/vercel-cutover.sql) for signup monitor + scraper apply fields).

### Cutover checklist

1. Deploy a Vercel **preview**, set env vars, run `prisma db push` against production DB.
2. Update Google OAuth redirect URIs / `NEXTAUTH_URL` for the preview host; smoke-test sign-in.
3. Smoke roster, practices, meets, notifications.
4. With Run Scraper connected: sync times, roster SwimCloud import, SwimPhone import. Separately, verify a meet PDF import works (needs `PDF_PARSER_URL`/`PDF_PARSER_SECRET`, not the scraper).
5. Hit signup-monitor cron manually once; configure external minutely cron.
6. Point `swimbuzz.gtswimclub.com` DNS / domain to Vercel; set production `NEXTAUTH_URL`.
7. Disable the Render service after traffic looks healthy.

## Web (Render — legacy)

Prefer Vercel for production. If still on Render:

| Setting | Value |
|---------|-------|
| Root directory | `.` (repository root) |
| Build | `pnpm install --frozen-lockfile && pnpm --filter @swimbuzz/web run build` |
| Start | `pnpm --filter @swimbuzz/web start` (stock `next start`) or `start:with-monitors` for in-process crons |
| `NODE_VERSION` | `22` |

Local `pnpm dev:web` still uses [`apps/web/server.js`](../apps/web/server.js) so signup/cleanup monitors run without external cron.

## Mobile (EAS)

1. `cd apps/mobile && npx eas-cli login`
2. Create an EAS project and set `extra.eas.projectId` in `app.json`
3. `eas build --platform ios` / `eas build --platform android`
4. `eas submit` (see `eas.json`)
5. Ensure `EXPO_PUBLIC_API_URL` points at the Vercel (or custom domain) origin
