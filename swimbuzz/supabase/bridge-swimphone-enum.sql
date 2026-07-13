-- Add SwimPhone meet import to Run scraper bridge job types.
ALTER TYPE "BridgeJobType" ADD VALUE IF NOT EXISTS 'SWIMPHONE_MEET';
