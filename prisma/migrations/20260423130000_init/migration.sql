-- Fit PWA init migration (Phase 1)
-- Creates extensions, 13 tables, pg_trgm/GIN indexes, a TSVECTOR generated
-- column on foods, and the daily_totals materialized view.

-- =============================================================================
-- Extensions
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- users
-- =============================================================================
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT,
    "pin_hash" TEXT NOT NULL,
    "height_cm" DECIMAL(5,1) NOT NULL,
    "current_weight_kg" DECIMAL(5,2) NOT NULL,
    "target_weight_kg" DECIMAL(5,2) NOT NULL,
    "birth_date" DATE NOT NULL,
    "diet_preference" TEXT NOT NULL,
    "daily_calorie_target" INTEGER NOT NULL DEFAULT 1900,
    "daily_protein_target_g" INTEGER NOT NULL DEFAULT 170,
    "daily_carbs_target_g" INTEGER NOT NULL DEFAULT 180,
    "daily_fat_target_g" INTEGER NOT NULL DEFAULT 50,
    "daily_water_target_ml" INTEGER NOT NULL DEFAULT 3750,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_diet_preference_check"
        CHECK ("diet_preference" IN ('veg', 'non-veg', 'mixed'))
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- =============================================================================
-- foods  (with TSVECTOR generated column + pg_trgm GIN index)
-- =============================================================================
CREATE TABLE "foods" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "name_hindi" TEXT,
    "category" TEXT NOT NULL,
    "is_veg" BOOLEAN NOT NULL,
    "calories_per_100g" DECIMAL(6,2) NOT NULL,
    "protein_g" DECIMAL(5,2) NOT NULL,
    "carbs_g" DECIMAL(5,2) NOT NULL,
    "fat_g" DECIMAL(5,2) NOT NULL,
    "fiber_g" DECIMAL(5,2),
    "serving_size_g" DECIMAL(6,2) NOT NULL,
    "serving_description" TEXT,
    "source" TEXT DEFAULT 'IFCT-2017',
    "confidence" TEXT DEFAULT 'high',
    "search_tokens" TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce("name", '') || ' ' || coalesce("name_hindi", ''))
    ) STORED,
    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_foods_search_tsv" ON "foods" USING GIN ("search_tokens");
CREATE INDEX "idx_foods_trgm"       ON "foods" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "foods_is_veg_idx"     ON "foods"("is_veg");
CREATE INDEX "foods_category_idx"   ON "foods"("category");

-- =============================================================================
-- meals
-- =============================================================================
CREATE TABLE "meals" (
    "id" SERIAL NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "meal_type" TEXT NOT NULL,
    "is_veg_option" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "foods_json" JSONB NOT NULL,
    "target_calories" INTEGER,
    "target_protein_g" INTEGER,
    CONSTRAINT "meals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meals_day_of_week_check"
        CHECK ("day_of_week" BETWEEN 1 AND 7),
    CONSTRAINT "meals_meal_type_check"
        CHECK ("meal_type" IN
            ('breakfast','mid-morning','lunch','snack','dinner','pre-workout','post-workout'))
);

CREATE INDEX "idx_meals_day" ON "meals"("day_of_week", "meal_type");

-- =============================================================================
-- food_logs
-- =============================================================================
CREATE TABLE "food_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "log_date" DATE NOT NULL,
    "food_id" INTEGER,
    "food_name" TEXT NOT NULL,
    "portion_g" DECIMAL(6,2) NOT NULL,
    "calories" DECIMAL(6,2) NOT NULL,
    "protein_g" DECIMAL(5,2) NOT NULL,
    "carbs_g" DECIMAL(5,2) NOT NULL,
    "fat_g" DECIMAL(5,2) NOT NULL,
    "fiber_g" DECIMAL(5,2),
    "source" TEXT NOT NULL,
    "photo_url" TEXT,
    "ai_confidence" DECIMAL(3,2),
    "ai_raw_json" JSONB,
    "meal_type" TEXT,
    CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "food_logs_source_check"
        CHECK ("source" IN ('manual','photo','meal_plan','barcode'))
);

CREATE INDEX "idx_food_logs_user_date" ON "food_logs"("user_id", "log_date" DESC);

ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_food_id_fkey"
    FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- water_logs
-- =============================================================================
CREATE TABLE "water_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "log_date" DATE NOT NULL,
    "amount_ml" INTEGER NOT NULL,
    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "water_logs_amount_ml_check" CHECK ("amount_ml" > 0)
);

CREATE INDEX "idx_water_logs_user_date" ON "water_logs"("user_id", "log_date" DESC);

ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- weight_logs
-- =============================================================================
CREATE TABLE "weight_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "log_date" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "waist_cm" DECIMAL(5,2),
    "chest_cm" DECIMAL(5,2),
    "hip_cm" DECIMAL(5,2),
    "body_fat_pct" DECIMAL(4,1),
    "notes" TEXT,
    "photo_url" TEXT,
    "face_photo_url" TEXT,
    CONSTRAINT "weight_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_weight_day" ON "weight_logs"("user_id", "log_date");

ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- workouts
-- =============================================================================
CREATE TABLE "workouts" (
    "id" SERIAL NOT NULL,
    "day_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "exercises_json" JSONB NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "description" TEXT,
    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workouts_day_number_check"
        CHECK ("day_number" BETWEEN 1 AND 7),
    CONSTRAINT "workouts_category_check"
        CHECK ("category" IN ('push','pull','legs','hiit','fullbody','cardio','rest'))
);

-- =============================================================================
-- exercises
-- =============================================================================
CREATE TABLE "exercises" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "muscle_groups" TEXT[] NOT NULL,
    "equipment_needed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "difficulty" TEXT,
    "image_url" TEXT,
    "youtube_id" TEXT,
    "attribution" TEXT,
    "instructions" TEXT NOT NULL,
    "form_cue" TEXT,
    "common_mistakes" TEXT,
    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exercises_difficulty_check"
        CHECK ("difficulty" IS NULL OR "difficulty" IN ('beginner','intermediate','advanced'))
);

CREATE UNIQUE INDEX "exercises_slug_key" ON "exercises"("slug");
CREATE INDEX "idx_exercises_muscle" ON "exercises" USING GIN ("muscle_groups");

-- =============================================================================
-- workout_logs
-- =============================================================================
CREATE TABLE "workout_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workout_id" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "log_date" DATE NOT NULL,
    "exercises_completed_json" JSONB NOT NULL,
    "duration_min" INTEGER,
    "rpe_overall" INTEGER,
    "notes" TEXT,
    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workout_logs_rpe_check"
        CHECK ("rpe_overall" IS NULL OR "rpe_overall" BETWEEN 1 AND 10)
);

ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_workout_id_fkey"
    FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- goals
-- =============================================================================
CREATE TABLE "goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "week_start_date" DATE NOT NULL,
    "target_weight_kg" DECIMAL(5,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- alerts_sent
-- =============================================================================
CREATE TABLE "alerts_sent" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data_json" JSONB,
    "dismissed_at" TIMESTAMPTZ(6),
    CONSTRAINT "alerts_sent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- push_subscriptions
-- =============================================================================
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh_key" TEXT NOT NULL,
    "auth_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- food_corrections
-- =============================================================================
CREATE TABLE "food_corrections" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "ai_guess" TEXT NOT NULL,
    "user_correction" TEXT NOT NULL,
    "photo_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "food_corrections_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "food_corrections" ADD CONSTRAINT "food_corrections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- daily_totals  (materialized view — refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY)
-- =============================================================================
CREATE MATERIALIZED VIEW "daily_totals" AS
SELECT
  "user_id",
  "log_date",
  SUM("calories")  AS "calories",
  SUM("protein_g") AS "protein_g",
  SUM("carbs_g")   AS "carbs_g",
  SUM("fat_g")     AS "fat_g",
  SUM("fiber_g")   AS "fiber_g",
  COUNT(*)         AS "items_logged"
FROM "food_logs"
GROUP BY "user_id", "log_date";

CREATE UNIQUE INDEX "idx_daily_totals_pk" ON "daily_totals"("user_id", "log_date");
