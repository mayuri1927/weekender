-- Phase 3: Activity Participants

CREATE TYPE "ParticipantStatus" AS ENUM ('JOINED', 'LEFT', 'REMOVED');

CREATE TABLE "activity_participants" (
    "id"          TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "status"      "ParticipantStatus" NOT NULL DEFAULT 'JOINED',
    "joined_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at"     TIMESTAMP(3),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activity_participants_pkey" PRIMARY KEY ("id")
);

-- One record per user per activity (status managed, not row-multiplied)
CREATE UNIQUE INDEX "activity_participants_activity_id_user_id_key"
    ON "activity_participants"("activity_id", "user_id");

CREATE INDEX "activity_participants_activity_id_idx"
    ON "activity_participants"("activity_id");

CREATE INDEX "activity_participants_user_id_idx"
    ON "activity_participants"("user_id");

CREATE INDEX "activity_participants_activity_id_status_idx"
    ON "activity_participants"("activity_id", "status");

ALTER TABLE "activity_participants"
    ADD CONSTRAINT "activity_participants_activity_id_fkey"
    FOREIGN KEY ("activity_id") REFERENCES "activities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_participants"
    ADD CONSTRAINT "activity_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
