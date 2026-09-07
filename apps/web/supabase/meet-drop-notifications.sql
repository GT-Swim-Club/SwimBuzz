-- Apply before deploying meet drop notifications (or use prisma db push).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEET_SIGNUP_DROPPED';
