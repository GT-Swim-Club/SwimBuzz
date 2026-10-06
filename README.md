# SwimBuzz

Team management app for **Georgia Tech Swim Club** — roster, practices, meets, results import, relay lineups.

## Project Overview

The web hosts both the UI and the API. The mobile version is a full client of that same API.

- `apps/web` — Next.js 16, hosts the UI **and** the `/api/`* backend
- `apps/mobile` — Expo / React Native app (iOS & Android)
- `packages/*` — code shared between web and mobile (roles/DTOs, API client, design tokens, RN UI primitives)
- `pdf_parsers/` + `api/parse-pdf.py` — server-side meet-PDF parsing (Vercel Python Function)

### Auth

- Google OAuth or `@gatech.edu` email OTP
- Roles: `ATHLETE`, `COACH`, `EXEC`
- Web uses NextAuth cookie/JWT sessions
- Mobile uses Bearer access/refresh tokens (`/api/auth/mobile/*`)
- Both resolve through the same `getSession()`



### Tech stack

- **Web:** Next.js 16, React 19, Tailwind 4, Prisma 5, NextAuth v4
- **Mobile:** Expo Router, SecureStore, Expo Notifications, expo-auth-session
- **Database / storage:** Supabase Postgres + Storage
- **Scraping:** Run Scraper (Python, Playwright) — SwimCloud/SwimPhone only
- **PDF parsing:** `api/parse-pdf.py`, a Vercel Python Function (pdfplumber)



## Onboarding checklist

Run commands from repo root.

### 1. Install the tools

- [ ] **Node 22.19+**
  ```bash
  brew install node                      # macOS
  winget install OpenJS.NodeJS.LTS       # Windows

  node -v                                # macOS/Windows
  ```
- [ ] **pnpm 9+** 
  ```bash
  npm install -g pnpm@9                  # Works on macO, Windows, and Linux
  brew install pnpm                      # macOS only
  ```
- [ ] **Python 3.11+** 
  ```bash
  brew install python                    # macOS
  winget install Python.Python.3.12      # Windows

  python3 --version                      # macOS
  python --version                       # Windows
  ```
- [ ] **Xcode / Android Studio** — if you'll work on the mobile app



### 2. Install dependencies

- [ ] Install JS packages:
  ```bash
  pnpm install
  ```
- [ ] Install the Python PDF-parsing packages:
  ```bash
  pip install -r requirements.txt
  ```



### 3. Set up the web environment file

- [ ] Copy the template:
  ```bash
  cp apps/web/.env.example apps/web/.env
  ```
- [ ] **Ask a maintainer for the shared dev values** and paste them in
- [ ] Run this and paste the result into `NEXTAUTH_SECRET`:
  ```bash
  openssl rand -base64 32
  ```
  On Windows without OpenSSL, run it in Git Bash, or use 
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```



### 4. Set up the database

- [ ] Generate the Prisma client:
  ```bash
  pnpm db:generate
  ```
- [ ] Push the schema to the database
  ```bash
  pnpm db:push
  ```



### 5. Run the web app

- [ ] Start it:
  ```bash
  pnpm dev:web
  ```
- [ ] Open [http://localhost:3000](http://localhost:3000), sign in, and check that the dashboard loads.
- [ ] Run lint once so you know the baseline is clean before you change anything:
  ```bash
  pnpm lint
  ```



### 6. Run the mobile app (optional)

- [ ] Copy the template:
  ```bash
  cp apps/mobile/.env.example apps/mobile/.env
  ```
- [ ] Find your computer's LAN IP:
  ```bash
  ipconfig getifaddr en0   # macOS
  ipconfig                 # Windows — use the "IPv4 Address" line
  ```
- [ ] In `apps/mobile/.env`, set `EXPO_PUBLIC_API_URL=http://<that IP>:3000`
- [ ] Keep `pnpm dev:web` running, then in a second terminal:
  ```bash
  pnpm dev:mobile
  ```
- [ ] Open the app using one of these options:
  - **Physical phone:** install **Expo Go** from the App Store or Google Play, make sure the phone is on the same Wi-Fi as your computer, then scan the QR code in the terminal. Use the Camera app on iOS or Expo Go's scanner on Android.
  - **iOS Simulator (macOS only):** with Xcode installed, press `i` in the Expo terminal.
  - **Android Emulator:** with Android Studio and an emulator running, press `a` in the Expo terminal.
- [ ] While you work, edits save and reload automatically. Press `r` in the Expo terminal to force a reload, or `m` to open the developer menu. On a physical phone, shake it to open the menu.

> Google sign-in does not work in Expo Go and needs separate iOS/Android OAuth client IDs. Use email sign-in in Expo Go.



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
└── DEPLOY.md                  # Vercel/Supabase/EAS deploy steps and cron setup
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


| Package            | Use                                                 |
| ------------------ | --------------------------------------------------- |
| `@swimbuzz/shared` | Roles, DTOs, date/name helpers                      |
| `@swimbuzz/api`    | `createApiClient` — cookie (web) or Bearer (mobile) |
| `@swimbuzz/tokens` | Brand colors and spacing                            |
| `@swimbuzz/ui`     | Shared RN UI primitives                             |




## Deploying

See `[DEPLOY.md](DEPLOY.md)` for how to deploy.