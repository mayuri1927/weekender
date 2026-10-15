-- Phase 1 QA fix: make name and gender optional in user_profiles.
-- Phase 1 onboarding only collects date of birth (age gate).
-- Name and gender are collected in Phase 2 onboarding screens.
ALTER TABLE "user_profiles" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "user_profiles" ALTER COLUMN "gender" DROP NOT NULL;
