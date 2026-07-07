# SwimBuzz

Swim team management app for coaches and athletes. Track rosters, import meet results, manage swim history, and build optimal relay lineups.

Built with **Next.js 16**, **Prisma 5**, **NextAuth** (Google sign-in), and a **Python FastAPI scraper** that pulls data from SwimCloud and parses meet PDFs.

## Features

- **Roster** — Browse athletes by gender and season. Coaches can sync from SwimCloud, add athletes manually, or import swims from a meet PDF.
- **Athlete profiles** — Personal bests, full swim history, manual time entry, and deletion of manually added swims.
- **Relay builder** — Optimal lineup suggestions for free and medley relays based on stored times.
- **Auth & roles** — Google OAuth with `COACH`, `EXEC`, and `ATHLETE` roles.

## Project structure

```
SwimBuzz/
├── swimbuzz/          # Next.js app (this package)
│   ├── prisma/        # Database schema
│   └── src/
│       ├── app/       # Pages and API routes
│       ├── components/
│       └── lib/
└── scraper/           # FastAPI service (run separately)
    ├── main.py
    └── pdf_parse.py
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL database (e.g. Supabase)
- Google OAuth credentials
- Playwright browsers (for the scraper)

## Environment variables

Copy `.env.example` from the repo root into `swimbuzz/.env` and fill in:

| Variable | Description |
|----------|-------------|
| `DIRECT_URL` | PostgreSQL connection string (used by Prisma) |
| `DATABASE_URL` | Pooled connection string for runtime, if used |
| `NEXTAUTH_SECRET` | Random secret for session signing |
| `NEXTAUTH_URL` | App URL, e.g. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `SCRAPER_URL` | Scraper base URL (default `http://localhost:8000`) |
| `SWIMCLOUD_TEAM_ID` | SwimCloud team ID for roster sync |

New Google sign-ups default to `COACH` for now. SwimCloud roster placeholders are still created as `ATHLETE`.

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

### Scraper

Required for SwimCloud roster sync, time scraping, and meet PDF parsing.

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --reload --port 8000
```

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open database GUI |
| `npx prisma db push` | Apply schema changes to the database |

### API routes

| Route | Purpose |
|-------|---------|
| `POST /api/roster/sync` | Sync roster from SwimCloud |
| `POST /api/times/sync` | Import SwimCloud times for all roster athletes |
| `POST /api/athletes` | Add athlete manually |
| `POST /api/meets/import` | Import swims from meet PDF |
| `POST /api/swims` | Add a manual swim |
| `DELETE /api/swims/[id]` | Delete a manual swim |
| `POST /api/relays/optimal` | Compute optimal relay lineups |
| `POST /api/scrape` | Scrape SwimCloud times for an athlete |

### Scraper endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /roster` | Fetch team roster from SwimCloud |
| `GET /times` | Fetch athlete times from SwimCloud |
| `POST /times/bulk` | Fetch times for many athletes (rate-limited, single browser session) |
| `POST /parse-meet-pdf` | Parse a meet results PDF |

## Tech stack

- **Frontend:** React 19, Tailwind CSS 4, next-themes
- **Backend:** Next.js App Router API routes
- **Database:** PostgreSQL via Prisma
- **Auth:** NextAuth v4 with Google provider
- **Scraper:** FastAPI, Playwright, pdfplumber
