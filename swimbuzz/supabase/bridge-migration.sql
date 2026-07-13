-- Run scraper bridge: pairing codes, connections, and scrape jobs.

CREATE TYPE "BridgeJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "BridgeJobType" AS ENUM ('ROSTER', 'TIMES_BULK');

CREATE TABLE "BridgePairing" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgePairing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BridgePairing_code_key" ON "BridgePairing"("code");
CREATE INDEX "BridgePairing_userId_idx" ON "BridgePairing"("userId");

CREATE TABLE "BridgeConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BridgeConnection_token_key" ON "BridgeConnection"("token");
CREATE INDEX "BridgeConnection_userId_idx" ON "BridgeConnection"("userId");

CREATE TABLE "BridgeJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT,
  "type" "BridgeJobType" NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "BridgeJobStatus" NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "BridgeJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BridgeJob_userId_status_idx" ON "BridgeJob"("userId", "status");
CREATE INDEX "BridgeJob_connectionId_status_idx" ON "BridgeJob"("connectionId", "status");

ALTER TABLE "BridgeJob"
  ADD CONSTRAINT "BridgeJob_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "BridgeConnection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
