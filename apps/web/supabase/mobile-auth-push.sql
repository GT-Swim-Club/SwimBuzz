-- Mobile auth refresh tokens + Expo push device tokens
-- Prefer: pnpm --filter @swimbuzz/web exec prisma db push
-- This SQL is a reference if you apply manually.

CREATE TABLE IF NOT EXISTS "MobileRefreshToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "MobileRefreshToken_userId_idx" ON "MobileRefreshToken"("userId");

CREATE TABLE IF NOT EXISTS "DevicePushToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "platform" TEXT NOT NULL,
  "deviceId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DevicePushToken_userId_idx" ON "DevicePushToken"("userId");
