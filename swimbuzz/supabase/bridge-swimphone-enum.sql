-- Add SwimPhone meet import to local sync bridge job types.
ALTER TYPE "BridgeJobType" ADD VALUE IF NOT EXISTS 'SWIMPHONE_MEET';
