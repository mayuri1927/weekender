-- AlterTable: add reminder_sent_at to activities for idempotent Phase 6 reminder scheduling
ALTER TABLE "activities" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);
