# SwimBuzz

Team management app for **Georgia Tech Swim Club**. Track rosters, plan practices, run meets, import results, and build relay lineups.

Built with **Next.js 16**, **Prisma 5**, **NextAuth** (Google sign-in), **Supabase Storage** (meet files), and a **Python FastAPI scraper** for SwimCloud, SwimPhone, and meet PDFs.

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

### Auth & roles

Google OAuth with three roles: `ATHLETE`, `COACH`, and `EXEC`. Coaches and execs share staff permissions for imports and editing.

Sign in at `/signin`. Signed-out users see a landing page at `/`.

## Project structure

```
SwimBuzz/
├── swimbuzz/              # Next.js app
│   ├── prisma/            # Database schema
│   ├── supabase/          # SQL migrations (meet files, travel info, etc.)
│   ├── public/            # Static assets
│   └── src/
│       ├── app/           # Pages and API routes
│       ├── components/
│       └── lib/           # Parsing, import, athlete matching, etc.
└── scraper/               # FastAPI service (run separately)
    ├── main.py
    ├── pdf_parse.py       # Meet results PDFs
    ├── sheet_parse.py     # Heat sheets, entry reports, psych sheets
    ├── swimphone_parse.py # SwimPhone meet results
    └── packet_parse.py    # Meet packet parsing
```

## Prerequisites

- Node.js 22+ (required by `undici` v8)
- Python 3.11+
- PostgreSQL database (e.g. Supabase)
- Google OAuth credentials
- Supabase project (for meet file storage)
- Playwright browsers (for the scraper)

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
| `SCRAPER_URL` | Scraper base URL (default `http://localhost:8000`) |
| `SWIMCLOUD_TEAM_ID` | SwimCloud team ID for roster sync |
| `CORS_ORIGINS` | Scraper only — comma-separated web app URLs allowed to call the API |
| `PLAYWRIGHT_HEADLESS` | Scraper only — `true` in production (default); set `false` locally if needed |

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

Apply any additional SQL migrations in `swimbuzz/supabase/` against your database as needed (meet file storage, travel info, season format, etc.).

### Scraper

Required for SwimCloud roster/time sync, SwimPhone imports, and meet PDF/sheet parsing.

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --reload --port 8000
```

Restart the scraper after pulling parser changes.

For local debugging, if SwimCloud blocks headless browsers, run with `PLAYWRIGHT_HEADLESS=false`.

## Deploy on Render

The repo includes a [`render.yaml`](render.yaml) Blueprint with two services:

| Service | Root | Runtime |
|---------|------|---------|
| `swimbuzz` | `swimbuzz/` | Node (`npm run start`) |
| `swimbuzz-scraper` | `scraper/` | Docker (Playwright + FastAPI) |

### Steps

1. **Supabase** — Create a project, run `npx prisma db push` against it, and apply SQL in `swimbuzz/supabase/`.
2. **Google OAuth** — Add redirect URI `https://YOUR_WEB_URL/api/auth/callback/google`.
3. **Render** — Dashboard → **New Blueprint** → connect this repo → apply `render.yaml`.
4. **Web env vars** (`swimbuzz` service) — Set `DIRECT_URL`, `SUPABASE_*`, `GOOGLE_*`, `NEXTAUTH_URL` (your Render web URL), and `SCRAPER_URL` (your Render scraper URL).
5. **Scraper env vars** (`swimbuzz-scraper` service) — Set `CORS_ORIGINS` to your web URL, e.g. `https://swimbuzz.onrender.com`.

### Manual deploy checklist

If you create services by hand instead of the Blueprint:

| Service | Setting | Value |
|---------|---------|-------|
| **Web** (`swimbuzz`) | Root directory | `swimbuzz` |
| | Build | `npm ci && npm run build` |
| | Start | `npm run start` |
| | `NODE_VERSION` | `22` |
| | `HOSTNAME` | `0.0.0.0` |
| | `NEXTAUTH_URL` | Your web URL, e.g. `https://swimbuzz.onrender.com` |
| | `SCRAPER_URL` | Your scraper URL, e.g. `https://swimbuzz-scraper.onrender.com` (no trailing slash) |
| **Scraper** | Root directory | `scraper` |
| | Environment | Docker |
| | Instance type | **Standard (2 GB RAM)** or higher — Playwright fails on 512 MB |
| | `PLAYWRIGHT_HEADLESS` | `true` |
| | `CORS_ORIGINS` | Your web URL |

After deploy, verify the scraper: `GET https://YOUR-SCRAPER/health/ready` should return `{"ok":true,"playwright":true}`.

When upgrading Playwright, update **both** `scraper/requirements.txt` (`playwright==X.Y.Z`) and the Docker base image in `scraper/Dockerfile` (`mcr.microsoft.com/playwright/python:vX.Y.Z-jammy`).

**Note:** SwimCloud imports can take several minutes. Render free web services time out after **30 seconds**; use **Starter** or higher on the web service for a 5-minute request timeout.

### Cloudflare / SwimCloud blocking

SwimCloud sits behind Cloudflare. Datacenter IPs (including Render) are often blocked with a "Just a moment..." page, which causes scraper **502** errors.

**Workaround — run the scraper on your laptop:**

```bash
cd scraper
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --host 0.0.0.0 --port 8000
```

In another terminal, expose port 8000 with a tunnel. Pick one:

**Option A — Cloudflare Tunnel (no account):**

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8000
```

Copy the `https://….trycloudflare.com` URL.

**Option B — localtunnel (no install, needs Node):**

```bash
npx localtunnel --port 8000
```

**Option C — ngrok:**

```bash
brew install ngrok/ngrok/ngrok
ngrok http 8000
```

Set **`SCRAPER_URL`** on the Render **web** service to the tunnel URL (no trailing slash). Keep the scraper and tunnel running while importing.

The Docker scraper uses headed Chromium via `xvfb` to reduce bot detection, but Cloudflare may still block Render IPs.

### Docker (scraper only)

```bash
cd scraper
docker build -t swimbuzz-scraper .
docker run -p 8000:8000 -e CORS_ORIGINS=http://localhost:3000 swimbuzz-scraper
```

Health check: `GET /health` on the scraper, `GET /` on the web app.

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open database GUI |
| `npx prisma db push` | Apply schema changes to the database |

### Key API routes

| Route | Purpose |
|-------|---------|
| `POST /api/roster/sync` | Import roster from SwimCloud |
| `POST /api/roster/import` | Import roster from CSV |
| `POST /api/times/sync` | Sync SwimCloud times for selected athletes |
| `POST /api/athletes` | Add athlete manually |
| `POST /api/meets/import` | Import meet results from PDF |
| `POST /api/meets/import/swimphone` | Import meet results from SwimPhone URL |
| `POST /api/meets/upload` | Upload meet resource files |
| `POST /api/practices` | Create practice (coaches) |
| `POST /api/relays/optimal` | Compute optimal relay lineups |
| `POST /api/scrape` | Scrape SwimCloud times for one athlete |

### Scraper endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /roster` | Fetch team roster from SwimCloud |
| `GET /times` | Fetch athlete times from SwimCloud |
| `POST /times/bulk` | Fetch times for many athletes |
| `POST /parse-meet-pdf` | Parse a meet results PDF |
| SwimPhone / sheet routes | Parse heat sheets, entry reports, SwimPhone pages |

## Tech stack

- **Frontend:** React 19, Tailwind CSS 4, next-themes
- **Backend:** Next.js App Router API routes
- **Database:** PostgreSQL via Prisma
- **Storage:** Supabase (meet PDFs and related files)
- **Auth:** NextAuth v4 with Google provider
- **Scraper:** FastAPI, Playwright, pdfplumber
