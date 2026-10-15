-- Phase 2: Geography, Interests, Activities

-- ─── New Enums ────────────────────────────────────────────────────────────────

CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'OPEN', 'FULL', 'CANCELLED', 'COMPLETED');
CREATE TYPE "ActivityVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "ActivityCategory" AS ENUM ('SPORTS', 'SOCIAL', 'ADVENTURE', 'FUN', 'CREATIVE', 'ENTERTAINMENT');
CREATE TYPE "ActivityType" AS ENUM ('OPEN', 'REQUEST');

-- ─── Geography ────────────────────────────────────────────────────────────────

CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cities_name_key" ON "cities"("name");

CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "areas_city_id_name_key" ON "areas"("city_id", "name");
CREATE INDEX "areas_city_id_idx" ON "areas"("city_id");

-- ─── Interests ────────────────────────────────────────────────────────────────

CREATE TABLE "interest_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interest_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "interest_categories_name_key" ON "interest_categories"("name");

CREATE TABLE "interests" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "interests_category_id_name_key" ON "interests"("category_id", "name");
CREATE INDEX "interests_category_id_idx" ON "interests"("category_id");

CREATE TABLE "user_interests" (
    "user_id" TEXT NOT NULL,
    "interest_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_interests_pkey" PRIMARY KEY ("user_id", "interest_id")
);

-- ─── Activities ───────────────────────────────────────────────────────────────

CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ActivityCategory" NOT NULL,
    "activity_type" "ActivityType" NOT NULL DEFAULT 'OPEN',
    "city_id" TEXT NOT NULL,
    "area_id" TEXT,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "max_participants" INTEGER NOT NULL,
    "min_participants" INTEGER,
    "status" "ActivityStatus" NOT NULL DEFAULT 'OPEN',
    "visibility" "ActivityVisibility" NOT NULL DEFAULT 'PUBLIC',
    "cover_image_url" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activities_host_id_idx" ON "activities"("host_id");
CREATE INDEX "activities_city_id_idx" ON "activities"("city_id");
CREATE INDEX "activities_area_id_idx" ON "activities"("area_id");
CREATE INDEX "activities_scheduled_date_idx" ON "activities"("scheduled_date");
CREATE INDEX "activities_status_idx" ON "activities"("status");
CREATE INDEX "activities_category_idx" ON "activities"("category");

-- ─── Add city/area to user_profiles ─────────────────────────────────────────

ALTER TABLE "user_profiles" ADD COLUMN "city_id" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "area_id" TEXT;
CREATE INDEX "user_profiles_city_id_idx" ON "user_profiles"("city_id");

-- ─── Foreign Keys ─────────────────────────────────────────────────────────────

ALTER TABLE "areas" ADD CONSTRAINT "areas_city_id_fkey"
    FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "interests" ADD CONSTRAINT "interests_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "interest_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_interest_id_fkey"
    FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_city_id_fkey"
    FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "activities" ADD CONSTRAINT "activities_host_id_fkey"
    FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities" ADD CONSTRAINT "activities_city_id_fkey"
    FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activities" ADD CONSTRAINT "activities_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
