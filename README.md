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
- **Meets** — Create/edit meets, travel, signup, room assign/publish, optimal relays (mobile); packet/sheet uploads, import results, full relay editor (web)
- **Practices** — Create, edit sets, publish, delete (mobile); TipTap editor + edit locks (web)
- **Qualifiers** — Nationals NQT tracking
- **Run scraper** — Desktop Python + Playwright helper (web UI only; mobile uses the same APIs once jobs complete)

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
├── scraper/                 # Run scraper source (synced into apps/web/public/scraper)
├── package.json             # pnpm workspaces + turbo
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 22+
- pnpm 9+
- Python 3.11+ (for Run scraper)
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

### Run scraper (required for imports)

SwimCloud / SwimPhone / PDF parsing runs on **your computer** via **Run scraper** (started from the web app). Mobile coaches can still trigger syncs and view results through the API.

## Deploy

### Web (Render)

Clone the full monorepo. Prefer **repo root** as the service root so workspace packages resolve:

| Setting | Value |
|---------|-------|
| Root directory | `.` (repository root) |
| Build | `pnpm install --frozen-lockfile && pnpm --filter @swimbuzz/web run build` |
| Start | `pnpm --filter @swimbuzz/web start` |
| `NODE_VERSION` | `22` |
| `NEXTAUTH_URL` | `https://swimbuzz.gtswimclub.com` |

If the service root must stay `apps/web`, install from the monorepo root in the build command (`cd ../.. && pnpm install && pnpm --filter @swimbuzz/web run build`) and start with `pnpm start` from `apps/web`.

After schema changes, run `prisma db push` (or apply [`apps/web/supabase/mobile-auth-push.sql`](apps/web/supabase/mobile-auth-push.sql)) so `MobileRefreshToken` and `DevicePushToken` exist.

### Mobile (EAS)

1. `cd apps/mobile && npx eas-cli login`
2. Create an EAS project and set `extra.eas.projectId` in `app.json`
3. `eas build --platform ios` / `eas build --platform android`
4. `eas submit` (see `eas.json`)

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
- **Scraping:** Run scraper (Python, Playwright)
