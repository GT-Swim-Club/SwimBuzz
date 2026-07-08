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

- Node.js 20+
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
