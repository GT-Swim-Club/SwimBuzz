# Deployment

SwimBuzz has two deploy targets. Vercel runs the web app, the `/api/*` backend, and the PDF parser. EAS builds and ships the mobile app. Both use one Supabase project for Postgres and file storage.

```
Vercel project (repo root)
├── Next.js app: apps/web (web UI + /api/*)
├── Python Function: api/parse-pdf.py (meet PDF parsing)
└── Vercel Cron: daily cleanup + staff-term expiry
External cron (cron-job.org): signup monitor, every minute
Supabase: Postgres + Storage (avatars, meet-files)
EAS: iOS / Android builds, pointed at the Vercel origin
```

Production domain: `https://swimbuzz.gtswimclub.com`

---



## 1. Vercel project

1. **Add New → Project** and import the repo.
2. Configure the project:

  | Setting          | Value                                                              |
  | ---------------- | ------------------------------------------------------------------ |
  | Root Directory   | `.` (repo root, so the workspace packages resolve)                 |
  | Framework Preset | Next.js                                                            |
  | Install Command  | `pnpm install --frozen-lockfile` (comes from `vercel.json`)        |
  | Build Command    | `pnpm --filter @swimbuzz/web run build` (comes from `vercel.json`) |
  | Output Directory | `apps/web/.next` (comes from `vercel.json`; leave the dashboard field blank) |
  | Node.js Version  | `24.x` or `22.x` (Settings → General; `apps/web` requires `>=22.19`) |

   Because the Vercel root is the repo root, Vercel's Next.js builder looks for `.next` and `public/` there, not in `apps/web`. Two things handle this: `outputDirectory` in `vercel.json` points at `apps/web/.next`, and the root `public` is a committed symlink to `apps/web/public`. Don't delete either one. Without them, the build fails with `The Next.js output directory ".next" was not found`, or static files return 404.

   `[vercel.json](vercel.json)` also registers the Python Function `api/parse-pdf.py` (60s max duration) and the daily crons. Vercel installs the function's dependencies from the root `requirements.txt` automatically. Keep web frameworks such as Flask and FastAPI out of that file: if Vercel detects one, it routes every request to it instead of Next.js.
3. Under **Settings → Environment Variables**, add the following for **Production**, and for **Preview** too if you use previews. [`.env.example.prod`](.env.example.prod) is a template of the same variables:

  | Variable                                            | Value                                                                                                                                          |
  | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | `DATABASE_URL`                                      | Supabase transaction pooler (`:6543`, `?pgbouncer=true&connection_limit=5`)                                                                    |
  | `DIRECT_URL`                                        | Supabase session pooler (`:5432`)                                                                                                              |
  | `SUPABASE_URL`                                      | `https://<ref>.supabase.co`                                                                                                                    |
  | `SUPABASE_SERVICE_ROLE_KEY`                         | service_role key                                                                                                                               |
  | `NEXTAUTH_URL`                                      | `https://swimbuzz.gtswimclub.com` (use the preview URL for Preview)                                                                            |
  | `NEXTAUTH_SECRET`                                   | `openssl rand -base64 32`                                                                                                                      |
  | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`         | Web OAuth client                                                                                                                               |
  | `NEXT_PUBLIC_GOOGLE_CLIENT_ID`                      | Same Web client ID                                                                                                                             |
  | `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` | Mobile OAuth clients                                                                                                                           |
  | `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`                 | Picker API key                                                                                                                                 |
  | `RESEND_API_KEY` / `EMAIL_FROM`                     | Resend                                                                                                                                         |
  | `SWIMCLOUD_TEAM_ID`                                 | `10004130`                                                                                                                                     |
  | `CRON_SECRET`                                       | `openssl rand -hex 32`. Required: every `/api/cron/*` route returns 500 without it.                                                            |
  | `PDF_PARSER_SECRET`                                 | `openssl rand -base64 32`                                                                                                                      |
  | `PDF_PARSER_URL`                                    | `https://swimbuzz.gtswimclub.com/api/parse-pdf`. Without it, PDF imports fail in production because the app tries to run local Python instead. |
  | `EXPO_ACCESS_TOKEN`                                 | Optional; only needed if push security is on for the Expo account                                                                                                                            |

   Don't set `HOSTNAME`, `PORT`, `HTTP_REQUEST_TIMEOUT_MS`, or `SCRAPER_SYNC_WAIT` on Vercel. They only apply to the local `server.js`.
4. **Deploy.** Then go to **Settings → Domains**, add `swimbuzz.gtswimclub.com`, and create the DNS record Vercel shows you.

**Request body limit:** Vercel caps request and response bodies at about 4.5MB. Large files go through Supabase Storage or a fetched URL, never raw multipart upload. `api/parse-pdf.py` only fetches PDFs from the `meet-files` bucket on `SUPABASE_URL`, and the app mirrors any other URL into that bucket before parsing.

## 2. Crons

Three routes live under `/api/cron/*`. Each accepts `GET` or `POST` and requires `Authorization: Bearer <CRON_SECRET>`.


| Route                            | What it does                                                                                                                             | Schedule                       | Runs on       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------- |
| `/api/cron/notification-cleanup` | Deletes old notifications and scraper jobs, and permanently purges Recently Deleted practices and meets whose recovery window has passed | Daily, `0 8 * * *` (08:00 UTC) | Vercel Cron   |
| `/api/cron/staff-term-expiry`    | Demotes coach/exec accounts whose staff term (May–Apr) has lapsed back to `ATHLETE`                                                      | Daily, `0 8 * * *`             | Vercel Cron   |
| `/api/cron/signup-monitor`       | Sends "signup opening soon" and "signup open" notifications and pushes for meets                                                         | **Every minute**               | External cron |




### 2a. Vercel Cron (the two daily jobs)

These two jobs are already defined in `vercel.json`, so there's nothing to add.

1. Make sure `CRON_SECRET` is set on the **Production** environment. Vercel sends it automatically as `Authorization: Bearer <CRON_SECRET>` on each cron invocation.
2. Redeploy production after changing `vercel.json` or `CRON_SECRET`. Crons only run on the **production** deployment, never on previews.
3. Check **Settings → Cron Jobs** in the Vercel dashboard. Both jobs should be listed there, and each has a **Run** button for a manual trigger. Logs appear under **Logs**, filtered by the route path.

On the Hobby plan, a cron can run at most once a day, and Vercel may run it at any point within the scheduled hour. That's fine for these two jobs.

### 2b. External cron (signup monitor, every minute)

The Hobby plan can't run a cron every minute, so a free external scheduler calls this route instead. The route is idempotent (`MeetSignupMonitorEvent` records each notification it has sent), so retries and overlapping runs don't send duplicates.

Setup with [cron-job.org](https://cron-job.org):

1. Create an account and choose **Create cronjob**.
2. **URL:** `https://swimbuzz.gtswimclub.com/api/cron/signup-monitor`
3. **Execution schedule:** every 1 minute.
4. **Advanced** settings:
  - Request method: `GET`
  - Headers: add `Authorization` with the value `Bearer <CRON_SECRET>` (the exact value set in Vercel)
  - Timeout: 30s
5. Save, then use **Test run**. You should get `200` and a JSON body that starts with `{"ok":true,...}`. A `401` means the header doesn't match `CRON_SECRET`; a `500` with `CRON_SECRET is not configured` means the env var is missing in Vercel.
6. Turn on failure notifications so you hear about repeated failures by email.

You can also trigger it manually from a terminal:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://swimbuzz.gtswimclub.com/api/cron/signup-monitor
```

> **On Vercel Pro:** you can drop the external cron and add this entry to `crons` in `vercel.json`:
> `{ "path": "/api/cron/signup-monitor", "schedule": "* * * * *" }`

> **Rotating** `CRON_SECRET`**:** update it in Vercel, redeploy, then update the header in cron-job.org. The signup monitor returns `401` between the redeploy and the header update.



### Local dev

`pnpm dev:web` runs `[apps/web/server.js](apps/web/server.js)`, which calls all three routes in-process (signup monitor every minute, the other two daily). If `CRON_SECRET` isn't set, it generates one, so local dev needs no external cron.

## 3. Run Scraper

SwimCloud and SwimPhone imports need a real browser, and Vercel can't run one. A coach runs the desktop Run Scraper (download it from the app) and pairs it with the deployment. Jobs are queued in `ScraperJob`. The web or mobile client polls `/api/scraper/jobs/[id]`, then calls `…/finalize`. Keep the scraper running during those imports. PDF imports don't use the scraper; they go through `api/parse-pdf.py`.

## 4. Smoke test after deploy

1. Sign in with Google and with `@gatech.edu` email OTP.
2. Load the roster, practices, and meets. Open and edit a practice to test the edit lock.
3. Upload an avatar and a meet file to confirm Supabase Storage works.
4. Import a meet PDF (tests `PDF_PARSER_URL` / `PDF_PARSER_SECRET`).
5. With Run Scraper connected, sync times and run a SwimCloud roster import and a SwimPhone import.
6. Click **Run** on both Vercel Cron jobs and check that each returns `200`. Check that cron-job.org shows recent successful runs of the signup monitor.
7. Sign in from the mobile app against production (next section) and confirm push notifications arrive.



## 5. Schema changes

There are no migration files. After changing `apps/web/prisma/schema.prisma`:

1. Run `pnpm db:push` against production, with `DIRECT_URL` pointing at the prod session pooler. Do this **before** deploying code that depends on the change.
2. If the change adds a table, rerun `apps/web/supabase/enable-rls.sql`, after adding the new table to that file.
3. If the change needs anything Prisma can't express (buckets, RLS, backfills), add an idempotent `.sql` file under `apps/web/supabase/` and run it in the SQL Editor.
4. Deploy. The build runs `prisma generate` on its own.



## 6. Mobile (EAS)

The EAS project is already linked (`owner: gt-swim-club`, `extra.eas.projectId` in `app.json`).

1. `cd apps/mobile && npx eas-cli login`
2. Set production env for EAS builds. Either use `eas env:create`, or set the variables in the expo.dev project under **Environment variables**:
  - `EXPO_PUBLIC_API_URL=https://swimbuzz.gtswimclub.com`
  - `EXPO_PUBLIC_WEB_URL=https://swimbuzz.gtswimclub.com`
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
3. Build:
  ```bash
   eas build --platform ios --profile production
   eas build --platform android --profile production
  ```
4. Submit with `eas submit --platform ios|android --profile production`. Before the first submit:
  - Replace `ascAppId` in `[eas.json](apps/mobile/eas.json)` with the App Store Connect app ID.
  - Put the Play Console service account key at `apps/mobile/google-play-service-account.json`, and never commit it. Android submits to the `internal` track.
5. Push notifications: EAS credentials handle APNs and FCM. Run `eas credentials` the first time to upload or generate the keys.

