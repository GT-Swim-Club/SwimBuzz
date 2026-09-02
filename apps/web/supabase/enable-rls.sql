-- Enable Row Level Security (default-deny, no policies) on every application table.
--
-- The app never queries Postgres through Supabase's anon/authenticated keys or
-- Supabase Auth — Prisma connects as the `postgres` role (table owner, via
-- DATABASE_URL/DIRECT_URL) and all Storage access goes through
-- SUPABASE_SERVICE_ROLE_KEY. Both bypass RLS entirely, so this has zero effect
-- on app behavior. Its only purpose is defense-in-depth: without RLS, every
-- table here is queryable/writable by anyone holding the project's public
-- anon key via Supabase's auto-generated PostgREST API. Enabling RLS with no
-- policies makes every table default-deny for that API.
--
-- Safe to run multiple times.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Athlete" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetSignupMonitorEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetSignupForm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetSignupEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetRoomForm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetRoomPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetRoomAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Swim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Practice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailLoginCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScraperPairing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScraperConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScraperJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NationalsStandardSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NationalsCut" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MobileRefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DevicePushToken" ENABLE ROW LEVEL SECURITY;
