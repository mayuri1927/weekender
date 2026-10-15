-- Phase 4: REQUEST activity approval — add PENDING and REJECTED participant statuses
-- ALTER TYPE ... ADD VALUE cannot run inside a BEGIN/COMMIT block if the type is
-- already referenced in the same transaction on PostgreSQL < 12.
-- PostgreSQL 15 is used here; both additions are safe inside a transaction.

ALTER TYPE "ParticipantStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ParticipantStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
