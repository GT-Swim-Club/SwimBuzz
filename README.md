# SwimBuzz

Team management app for **Georgia Tech Swim Club**. Track rosters, plan practices, run meets, import results, and build relay lineups.

Built with **Next.js 16**, **Prisma 5**, **NextAuth** (Google + Georgia Tech email OTP), **Supabase Storage** (meet files), and **Run scraper** (Python + Playwright on your computer) for SwimCloud, SwimPhone, and meet PDFs.

## Features

### Athletes

- Browse the roster by gender and season
- View personal bests and full swim history on athlete profiles
- Follow meets — dates, heat sheets, entries, travel info, live stream links
- Read published practice plans

### Coaches & exec

- **Roster** — Import from SwimCloud or CSV (with nickname parsing and duplicate merging), add athletes manually, sync SwimCloud times
- **Meets** — Create meets, upload packets/heat sheets/entries, import results from SwimPhone or PDF, manage event order, travel info, and per-meet relay assignments
- **Practices** — Write practice plans with tagged sets; publish for the team
- **Relays** — Optimal lineup suggestions and meet relay editing with leadoff import
- **Qualifiers** — Upload Nationals NQT PDFs and track who has made cuts from season meets

### Auth & roles

Google OAuth and Georgia Tech email verification codes, with three roles: `ATHLETE`, `COACH`, and `EXEC`. Coaches and execs share staff permissions for imports and editing.

Athletes can sign in with their `@gatech.edu` email if it matches a roster entry: SwimBuzz emails a 6-digit code, then creates a session after verification. Coaches can continue using Google.

Sign in at `/signin`. Signed-out users see a landing page at `/`.

## Project structure

```
SwimBuzz/
├── swimbuzz/              # Next.js app
│   ├── prisma/            # Database schema
│   ├── supabase/          # SQL migrations (meet files, travel info, etc.)
│   ├── public/bridge/     # Run scraper install scripts + synced Python (from scraper/)
│   └── src/
│       ├── app/           # Pages and API routes
│       ├── components/
│       └── lib/           # Parsing, import, athlete matching, etc.
└── scraper/               # Run scraper source (synced into public/bridge on build)
    ├── bridge.py          # Run scraper client
    ├── swimcloud_scrape.py
    ├── pdf_parse.py       # Meet results PDFs
    ├── sheet_parse.py     # Heat sheets, entry reports, psych sheets
    ├── swimphone_parse.py # SwimPhone meet results
    ├── packet_parse.py    # Meet packet parsing
    └── nqt_parse.py       # Nationals qualifying times PDFs
```

## Prerequisites

- Node.js 22+
- Python 3.11+ (for Run scraper)
- PostgreSQL database (e.g. Supabase)
- Google OAuth credentials
- Resend API key (for @gatech.edu email sign-in codes; optional in local dev)
- Supabase project (for meet file storage)
- Playwright Chromium (installed by the Run scraper setup)

## Environment variables

Copy `.env.example` from the repo root into `swimbuzz/.env` and fill in:

| Variable | Description |
|----------|-------------|
| `DIRECT_URL` | PostgreSQL connection string (used by Prisma) |
| `DATABASE_URL` | Pooled connection string for runtime, if used |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key (not the anon key) |
| `NEXTAUTH_SECRET` | Random secret for session signing |
| `NEXTAUTH_URL` | App URL, e.g. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RESEND_API_KEY` | Resend API key for verification emails (required in production) |
| `EMAIL_FROM` | From address for auth emails (must be verified in Resend) |
| `SWIMCLOUD_TEAM_ID` | SwimCloud team ID for roster sync |

New Google sign-ups default to `COACH` for now. Athletes created via SwimCloud or CSV import are stored as `ATHLETE`.

## Setup

### Web app

```bash
cd swimbuzz
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Apply any additional SQL migrations in `swimbuzz/supabase/` against your database as needed (meet file storage, travel info, season format, nationals standards, etc.).

### Run scraper (required for imports)

SwimCloud, SwimPhone, and meet PDF/sheet parsing run on **your computer** via **Run scraper** — not on the web server. That avoids Cloudflare blocking datacenter IPs.

1. In the app, open **Run scraper** and generate a run command.
2. Install/run the helper (scripts under `/bridge/` on the running app, or from `swimbuzz/public/bridge/`).
3. Keep it running while importing roster, times, SwimPhone meets, or PDFs.

Bridge Python lives in `scraper/` and is copied into `swimbuzz/public/bridge/` on `npm run dev` / `npm run build`.

## Deploy on Render

Deploy the **web app only** (`swimbuzz/`). There is no separate scraper service.

### Steps

1. **Supabase** — Create a project, run `npx prisma db push` against it, and apply SQL in `swimbuzz/supabase/`.
2. **Google OAuth** — Add redirect URI `https://YOUR_WEB_URL/api/auth/callback/google`.
3. **Render** — Create a Node web service with root directory `swimbuzz`.
4. **Env vars** — Set `DIRECT_URL`, `SUPABASE_*`, `GOOGLE_*`, and `NEXTAUTH_URL` (your Render web URL).

### Manual deploy checklist

| Setting | Value |
|---------|-------|
| Root directory | `swimbuzz` |
| Build | `npm ci && npm run build` |
| Start | `npm run start` |
| `NODE_VERSION` | `22` |
| `HOSTNAME` | `0.0.0.0` |
| `NEXTAUTH_URL` | Your web URL, e.g. `https://swimbuzz.onrender.com` |

**Note:** SwimCloud **times** imports take about **1–2 minutes per athlete** (roster import is much faster). Render free web services time out after **30 seconds**; use **Starter** or higher on the web service so long jobs can finish. Always **run the scraper** before importing.

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js (also syncs bridge files from `scraper/`) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open database GUI |
| `npx prisma db push` | Apply schema changes to the database |

### Key API routes

| Route | Purpose |
|-------|---------|
| `POST /api/roster/sync` | Import roster from SwimCloud (via Run scraper) |
| `POST /api/roster/import` | Import roster from CSV |
| `POST /api/times/sync` | Sync SwimCloud times for selected athletes (via Run scraper) |
| `POST /api/athletes` | Add athlete manually |
| `POST /api/meets/import` | Import meet results from PDF (via Run scraper) |
| `POST /api/meets/import/swimphone` | Import meet results from SwimPhone URL (via Run scraper) |
| `POST /api/meets/upload` | Upload meet resource files |
| `POST /api/practices` | Create practice (coaches) |
| `POST /api/relays/optimal` | Compute optimal relay lineups |
| `POST /api/scrape` | Scrape SwimCloud times for one athlete (via Run scraper) |
| `POST /api/bridge/*` | Run scraper pairing, jobs, and heartbeat |

## Tech stack

- **Frontend:** React 19, Tailwind CSS 4, next-themes
- **Backend:** Next.js App Router API routes
- **Database:** PostgreSQL via Prisma
- **Storage:** Supabase (meet PDFs and related files)
- **Auth:** NextAuth v4 with Google provider
- **Scraping:** Run scraper (Python, Playwright, pdfplumber)
