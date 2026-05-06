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

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);
--
-- PostgreSQL database dump
--

\restrict YGZbLVsTdZKFjiSqzy8yhAXUB4MpacvQ3l0vIXjTGYwPmgcQsFQSdKtgnVHWirH

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: exercises; Type: TABLE DATA; Schema: public; Owner: fit
--

INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (3, 'Decline push-up', 'push-up-decline', 'push', '{chest,triceps,shoulders}', '{bench}', 'intermediate', NULL, NULL, NULL, 'Feet elevated on bench, hands on floor shoulder-width. Lower chest then press up. Biases upper chest.', 'Keep core tight; don''t dump hips toward the floor.', 'Neck craning; elbows flaring wide.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (4, 'Diamond push-up', 'push-up-diamond', 'push', '{triceps,chest}', '{}', 'intermediate', NULL, NULL, NULL, 'Place hands together forming a diamond under chest. Lower and press up with elbows close to body.', 'Drive elbows back, not out.', 'Going too deep if shoulders are tight.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (5, 'Dumbbell bench press', 'db-bench-press', 'push', '{chest,triceps,shoulders}', '{dumbbell,bench}', 'intermediate', NULL, NULL, NULL, 'Lie on bench, dumbbells at chest. Press straight up until arms lock, lower under control.', 'Wrists over elbows at lockout.', 'Bouncing weights off chest.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (6, 'Dumbbell shoulder press', 'db-shoulder-press', 'push', '{shoulders,triceps}', '{dumbbell}', 'intermediate', NULL, NULL, NULL, 'Seated or standing, dumbbells at shoulder height. Press overhead until arms straight, lower to ears.', 'Don''t arch lower back — keep ribs down.', 'Hyperextending lumbar spine.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (7, 'Dumbbell lateral raise', 'db-lateral-raise', 'push', '{shoulders}', '{dumbbell}', 'beginner', NULL, NULL, NULL, 'Standing, slight elbow bend. Raise arms out to sides until parallel to floor. Lower slowly.', 'Lead with elbows, pinky up.', 'Using too much weight and swinging.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (8, 'Pike push-up', 'pike-push-up', 'push', '{shoulders,triceps}', '{}', 'intermediate', NULL, NULL, NULL, 'Downward-dog position with hips high. Lower crown of head toward floor between hands, then press up.', 'Hips high; push floor away at top.', 'Letting hips drop into a push-up position.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (9, 'Chair dip', 'chair-dip', 'push', '{triceps,chest,shoulders}', '{chair}', 'beginner', NULL, NULL, NULL, 'Hands on chair edge behind you, feet out. Lower body by bending elbows, then press up.', 'Elbows back, not out. Keep chest up.', 'Shrugging shoulders up.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (10, 'Overhead tricep extension', 'overhead-tricep-extension', 'push', '{triceps}', '{dumbbell}', 'beginner', NULL, NULL, NULL, 'Hold one dumbbell overhead with both hands. Lower behind head by bending elbows, then extend up.', 'Keep elbows tucked by your ears.', 'Elbows flaring out.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (11, 'Bent-over dumbbell row', 'bent-over-db-row', 'pull', '{back,biceps,core}', '{dumbbell}', 'intermediate', NULL, NULL, NULL, 'Hinge at hips with flat back, dumbbells hanging. Row to lower ribs, squeeze shoulder blades, lower.', 'Pull with elbows, not hands.', 'Rounding the lower back.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (12, 'Single-arm dumbbell row', 'single-arm-row', 'pull', '{back,biceps}', '{dumbbell,bench}', 'beginner', NULL, NULL, NULL, 'Knee + hand on bench, opposite hand rows dumbbell to hip, squeezing lat.', 'Drive elbow past ribs; no twist.', 'Jerking the weight up.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (14, 'Dumbbell curl', 'db-curl', 'pull', '{biceps,forearms}', '{dumbbell}', 'beginner', NULL, NULL, NULL, 'Arms at sides, palms forward. Curl up without swinging torso, squeeze top, lower slow.', 'Elbows pinned to ribs.', 'Using momentum; shortening range.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (15, 'Hammer curl', 'hammer-curl', 'pull', '{biceps,forearms}', '{dumbbell}', 'beginner', NULL, NULL, NULL, 'Neutral grip (thumbs up). Curl both arms, control the descent.', 'Lock wrists; no swinging.', 'Rolling wrists inward at top.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (16, 'Reverse fly', 'reverse-fly', 'pull', '{shoulders,back}', '{dumbbell}', 'beginner', NULL, NULL, NULL, 'Hinge at hips with light dumbbells. Raise arms out to sides, pinching shoulder blades.', 'Lead with elbows; pause at top.', 'Using heavy weight and shrugging.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (17, 'Pull-up', 'pull-up', 'pull', '{back,biceps,core}', '{"pull-up bar"}', 'advanced', NULL, NULL, NULL, 'Overhand grip, shoulder-width. Pull until chin clears bar, lower fully.', 'Drive elbows down to your back pockets.', 'Kipping; partial range.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (18, 'Inverted row', 'inverted-row', 'pull', '{back,biceps}', '{bar,table}', 'beginner', NULL, NULL, NULL, 'Lie under a bar/table edge, grip, pull chest to bar keeping body straight.', 'Squeeze shoulder blades at top.', 'Letting hips sag.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (19, 'Band face-pull', 'band-face-pull', 'pull', '{shoulders,back}', '{"resistance band"}', 'beginner', NULL, NULL, NULL, 'Anchor band at face height. Pull toward forehead, externally rotating shoulders, elbows high.', 'Thumbs end pointing back.', 'Pulling to chest instead of face.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (20, 'Superman', 'superman', 'pull', '{back,glutes}', '{}', 'beginner', NULL, NULL, NULL, 'Lie face down, arms extended. Lift chest, arms, and legs simultaneously; hold, lower.', 'Squeeze glutes; look at floor.', 'Cranking the neck upward.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (21, 'Bodyweight squat', 'bw-squat', 'legs', '{quads,glutes,hamstrings}', '{}', 'beginner', NULL, NULL, NULL, 'Feet shoulder-width. Sit hips back and down until thighs parallel, drive through heels to stand.', 'Knees track over toes; chest up.', 'Knees caving in; heels lifting.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (22, 'Goblet squat', 'goblet-squat', 'legs', '{quads,glutes,core}', '{dumbbell}', 'beginner', NULL, NULL, NULL, 'Hold dumbbell at chest. Squat down keeping elbows inside knees, stand tall.', 'Elbows inside knees at bottom.', 'Rounding upper back.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (23, 'Walking lunge', 'walking-lunge', 'legs', '{quads,glutes,hamstrings}', '{}', 'intermediate', NULL, NULL, NULL, 'Step forward to 90° front knee, back knee hovering. Drive through front heel into next step.', 'Long step; vertical front shin.', 'Front knee drifting past toes.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (24, 'Bulgarian split squat', 'bulgarian-split-squat', 'legs', '{quads,glutes}', '{bench,dumbbell}', 'intermediate', NULL, NULL, NULL, 'Rear foot on bench, front foot forward. Squat down until front thigh parallel, drive up.', 'Weight on front heel.', 'Front foot too close to bench.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (25, 'Glute bridge', 'glute-bridge', 'legs', '{glutes,hamstrings}', '{}', 'beginner', NULL, NULL, NULL, 'Lie on back, knees bent, feet flat. Drive hips up until body is straight line, squeeze glutes.', 'Ribcage down; don''t overextend lumbar.', 'Pushing through toes.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (2, 'Incline push-up', 'push-up-incline', 'push', '{chest,triceps,shoulders}', '{bench}', 'beginner', NULL, NULL, NULL, 'Place hands on a sturdy bench or counter. Lower chest to the edge, then press up.', 'The higher the surface, the easier — regress as needed.', 'Letting lower back arch; rushing reps.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (27, 'Calf raise', 'calf-raise', 'legs', '{calves}', '{}', 'beginner', NULL, NULL, NULL, 'Stand tall, rise onto balls of feet, squeeze calves, lower slowly.', 'Pause at top; full range.', 'Bouncing reps.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (28, 'Wall sit', 'wall-sit', 'legs', '{quads,glutes}', '{}', 'beginner', NULL, NULL, NULL, 'Back against wall, thighs parallel to floor. Hold for time.', 'Knees behind toes.', 'Sliding knees past toes.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (29, 'Jump squat', 'jump-squat', 'legs', '{quads,glutes,calves}', '{}', 'intermediate', NULL, NULL, NULL, 'Squat down, explode up into a jump, land soft back into squat.', 'Land with soft knees, not stiff.', 'Knees collapsing on landing.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (30, 'Step-up', 'step-up', 'legs', '{quads,glutes}', '{bench}', 'beginner', NULL, NULL, NULL, 'Step one foot onto bench, drive through heel to stand, step back down controlled.', 'No push-off from trailing leg.', 'Bouncing off the back foot.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (31, 'Burpee', 'burpee', 'hiit', '{full-body}', '{}', 'intermediate', NULL, NULL, NULL, 'Squat, hands down, kick feet back to plank, optional push-up, jump feet in, leap up.', 'Brace core on every rep.', 'Hips sagging in plank.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (32, 'Mountain climber', 'mountain-climber', 'hiit', '{core,shoulders}', '{}', 'beginner', NULL, NULL, NULL, 'Plank position. Alternate driving knees to chest rapidly.', 'Hips level with shoulders.', 'Bouncing hips up and down.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (33, 'Jumping jack', 'jumping-jack', 'hiit', '{full-body,calves}', '{}', 'beginner', NULL, NULL, NULL, 'Jump feet out while raising arms overhead; jump back.', 'Soft landings.', 'Heavy stomping.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (34, 'High knees', 'high-knees', 'hiit', '{legs,core}', '{}', 'beginner', NULL, NULL, NULL, 'Run in place driving knees to hip height. Pump arms.', 'Stay on balls of feet.', 'Leaning back.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (35, 'Squat jump', 'squat-jump', 'hiit', '{quads,glutes}', '{}', 'intermediate', NULL, NULL, NULL, 'Squat, explode up vertically, land soft back into squat immediately.', 'Absorb landing.', 'Locking knees on landing.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (36, 'Skater jump', 'skater-jump', 'hiit', '{glutes,quads,calves}', '{}', 'intermediate', NULL, NULL, NULL, 'Bound laterally from one leg to the other, tapping non-weight foot behind.', 'Land soft with knee tracking over toe.', 'Stiff ankles on landing.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (37, 'Dumbbell thruster', 'db-thruster', 'fullbody', '{quads,glutes,shoulders}', '{dumbbell}', 'intermediate', NULL, NULL, NULL, 'Front squat with dumbbells at shoulders. Stand explosively and press dumbbells overhead.', 'Use leg drive into the press.', 'Pressing before standing fully.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (38, 'Renegade row', 'renegade-row', 'fullbody', '{back,core,shoulders}', '{dumbbell}', 'advanced', NULL, NULL, NULL, 'Plank on dumbbells, row one up to hip, lower, alternate. Keep hips square.', 'Feet wider for stability.', 'Hips rotating on each row.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (39, 'Dumbbell swing', 'db-swing', 'fullbody', '{glutes,hamstrings,back}', '{dumbbell}', 'intermediate', NULL, NULL, NULL, 'Hinge hips, swing dumbbell between legs; snap hips to drive it to shoulder height.', 'Power from hips, not arms.', 'Squatting instead of hinging.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (40, 'Bear crawl', 'bear-crawl', 'fullbody', '{core,shoulders}', '{}', 'intermediate', NULL, NULL, NULL, 'Hands and knees, knees hovering 2 inches. Crawl forward moving opposite hand + foot.', 'Back flat; hips low.', 'Hips riding too high.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (41, 'Jumping rope', 'jumping-rope', 'cardio', '{calves,shoulders}', '{"jump rope"}', 'beginner', NULL, NULL, NULL, 'Small hops on balls of feet, wrists rotate the rope.', 'Wrists do the work, not arms.', 'Jumping too high.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (42, 'Shadow boxing', 'shadow-boxing', 'cardio', '{full-body,core}', '{}', 'beginner', NULL, NULL, NULL, 'Stance set. Throw jabs, crosses, hooks with rotation from hips and feet.', 'Return hands to guard every punch.', 'Dropping the guard.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (43, 'Running in place', 'running-in-place', 'cardio', '{legs,core}', '{}', 'beginner', NULL, NULL, NULL, 'Jog in place at a moderate tempo, driving knees and swinging arms.', 'Land midfoot, not heel.', 'Slouching forward.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (44, 'Plank', 'plank', 'core', '{core,shoulders,glutes}', '{}', 'beginner', NULL, NULL, NULL, 'Forearms on floor, body straight from head to heels. Hold for time.', 'Squeeze glutes; ribs down.', 'Hips sagging or piking up.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (45, 'Side plank', 'side-plank', 'core', '{core,obliques}', '{}', 'beginner', NULL, NULL, NULL, 'Forearm on floor, stack feet, lift hips to a straight line from head to feet.', 'Stack shoulder over elbow.', 'Hips dropping toward floor.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (46, 'Russian twist', 'russian-twist', 'core', '{core,obliques}', '{}', 'beginner', NULL, NULL, NULL, 'Sit back at 45°, feet off floor. Rotate torso side-to-side, tapping floor each side.', 'Move from ribs, not arms.', 'Rounding lower back.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (47, 'Leg raise', 'leg-raise', 'core', '{core}', '{}', 'intermediate', NULL, NULL, NULL, 'Lie on back, legs straight. Raise to 90°, lower slowly without touching floor.', 'Press lower back into floor.', 'Arching lower back.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (48, 'Dead bug', 'dead-bug', 'core', '{core}', '{}', 'beginner', NULL, NULL, NULL, 'Lie on back, arms and legs up. Lower opposite arm and leg to floor, return, alternate.', 'Lower back stays pinned to floor.', 'Lumbar lifting off floor.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (49, 'Bird dog', 'bird-dog', 'core', '{core,glutes,back}', '{}', 'beginner', NULL, NULL, NULL, 'On hands and knees, extend opposite arm and leg. Pause, return, alternate.', 'Long spine; no rotation.', 'Hips tilting.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (50, 'Bicycle crunch', 'bicycle-crunch', 'core', '{core,obliques}', '{}', 'beginner', NULL, NULL, NULL, 'Lie on back, hands behind head. Alternate bringing opposite elbow to opposite knee.', 'Rotate from torso, not neck.', 'Yanking on neck.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (1, 'Push-up', 'push-up', 'push', '{chest,triceps,shoulders,core}', '{}', 'beginner', NULL, NULL, NULL, 'Start in a plank with hands shoulder-width. Lower chest to the floor keeping body in a straight line, then press back up.', 'Squeeze glutes and brace core — no hip sag.', 'Flared elbows; hips dropping; partial range of motion.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (13, 'Dumbbell Romanian deadlift', 'db-rdl', 'pull', '{hamstrings,glutes,back}', '{dumbbell}', 'intermediate', NULL, NULL, NULL, 'Dumbbells in front of thighs. Push hips back, lower weights along legs until tension in hamstrings, drive hips forward.', 'Soft knees; lats tight; hinge not squat.', 'Rounding the back; squatting down.');
INSERT INTO public.exercises (id, name, slug, category, muscle_groups, equipment_needed, difficulty, image_url, youtube_id, attribution, instructions, form_cue, common_mistakes) VALUES (26, 'Hip thrust', 'hip-thrust', 'legs', '{glutes,hamstrings}', '{bench,dumbbell}', 'intermediate', NULL, NULL, NULL, 'Upper back on bench, weight on hips. Drive hips up to full extension, pause, lower.', 'Chin tucked; ribs down at top.', 'Hyperextending lower back.');


--
-- Data for Name: foods; Type: TABLE DATA; Schema: public; Owner: fit
--

INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (1, 'roti', 'रोटी', 'grains', true, 297.00, 11.00, 58.00, 4.00, 11.00, 35.00, '1 roti (~35g)', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (2, 'brown rice cooked', 'भूरा चावल', 'grains', true, 123.00, 2.70, 25.60, 1.00, 1.80, 150.00, '1 katori (~150g)', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (3, 'white rice cooked', 'सफेद चावल', 'grains', true, 130.00, 2.70, 28.00, 0.30, 0.40, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (4, 'basmati rice cooked', 'बासमती चावल', 'grains', true, 121.00, 3.00, 25.00, 0.40, 0.40, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (5, 'jeera rice', 'जीरा चावल', 'grains', true, 145.00, 2.80, 25.00, 3.50, 0.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (6, 'poha', 'पोहा', 'grains', true, 130.00, 2.60, 22.00, 3.50, 1.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (7, 'upma', 'उपमा', 'grains', true, 132.00, 3.50, 20.00, 4.00, 1.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (8, 'besan chilla', 'बेसन चीला', 'grains', true, 185.00, 9.00, 20.00, 7.00, 3.00, 80.00, '1 chilla', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (9, 'moong dal chilla', 'मूंग दाल चीला', 'grains', true, 145.00, 9.00, 18.00, 4.00, 3.00, 80.00, '1 chilla', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (10, 'oats dry', 'ओट्स', 'grains', true, 389.00, 16.90, 66.30, 6.90, 10.60, 40.00, '40g dry', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (11, 'oats cooked with water', 'पका हुआ ओट्स', 'grains', true, 71.00, 2.40, 12.00, 1.40, 1.70, 250.00, '1 bowl', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (12, 'idli', 'इडली', 'grains', true, 155.00, 5.00, 30.00, 0.80, 1.00, 35.00, '1 idli', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (13, 'dosa plain', 'सादा डोसा', 'grains', true, 168.00, 3.90, 28.00, 4.50, 1.00, 80.00, '1 dosa', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (14, 'bajra roti', 'बाजरे की रोटी', 'grains', true, 260.00, 10.00, 52.00, 3.00, 12.00, 40.00, '1 roti', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (15, 'jowar roti', 'ज्वार की रोटी', 'grains', true, 252.00, 9.50, 50.00, 3.00, 7.00, 40.00, '1 roti', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (16, 'ragi roti', 'रागी की रोटी', 'grains', true, 245.00, 8.00, 54.00, 1.80, 7.00, 40.00, '1 roti', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (17, 'quinoa cooked', 'क्विनोआ', 'grains', true, 120.00, 4.40, 21.00, 1.90, 2.80, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (18, 'multigrain bread slice', 'मल्टीग्रेन ब्रेड', 'grains', true, 265.00, 10.00, 45.00, 4.00, 6.00, 30.00, '1 slice', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (19, 'brown bread slice', 'ब्राउन ब्रेड', 'grains', true, 247.00, 11.00, 49.00, 3.50, 6.90, 30.00, '1 slice', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (20, 'naan', 'नान', 'grains', true, 310.00, 9.00, 52.00, 6.00, 2.00, 80.00, '1 naan', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (21, 'paratha plain', 'परांठा', 'grains', true, 330.00, 9.00, 50.00, 11.00, 5.00, 60.00, '1 paratha', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (22, 'aloo paratha', 'आलू परांठा', 'grains', true, 300.00, 7.00, 42.00, 11.00, 4.00, 120.00, '1 paratha', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (23, 'moong dal cooked', 'मूंग दाल', 'dals', true, 105.00, 7.00, 15.00, 1.50, 4.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (24, 'toor dal cooked', 'तूर दाल', 'dals', true, 116.00, 7.20, 17.00, 2.00, 3.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (25, 'masoor dal cooked', 'मसूर दाल', 'dals', true, 115.00, 8.00, 18.00, 1.00, 3.80, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (26, 'chana dal cooked', 'चना दाल', 'dals', true, 140.00, 8.00, 20.00, 2.50, 6.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (27, 'urad dal cooked', 'उड़द दाल', 'dals', true, 130.00, 9.00, 19.00, 1.00, 4.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (28, 'rajma cooked', 'राजमा', 'dals', true, 127.00, 8.70, 22.80, 0.50, 6.40, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (29, 'kabuli chana cooked', 'काबुली चना', 'dals', true, 164.00, 8.90, 27.00, 2.60, 7.60, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (30, 'black chana cooked', 'काला चना', 'dals', true, 150.00, 9.00, 26.00, 2.00, 7.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (31, 'lobia cooked', 'लोबिया', 'dals', true, 120.00, 7.70, 20.00, 0.60, 6.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (32, 'mixed dal', 'मिक्स दाल', 'dals', true, 125.00, 8.00, 18.00, 1.80, 4.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (33, 'palak cooked', 'पालक', 'vegetables', true, 26.00, 3.00, 3.60, 0.40, 2.20, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (34, 'palak sabzi', 'पालक सब्ज़ी', 'vegetables', true, 82.00, 3.00, 6.50, 4.80, 3.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (35, 'methi leaves cooked', 'मेथी', 'vegetables', true, 50.00, 4.30, 6.00, 0.90, 2.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (36, 'bhindi sabzi', 'भिंडी', 'vegetables', true, 95.00, 2.20, 9.00, 6.00, 3.20, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (37, 'boiled aloo', 'उबला आलू', 'vegetables', true, 87.00, 1.90, 20.10, 0.10, 1.80, 150.00, '1 medium', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (38, 'lauki sabzi', 'लौकी', 'vegetables', true, 55.00, 1.20, 6.00, 3.00, 2.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (39, 'cauliflower sabzi', 'फूलगोभी', 'vegetables', true, 75.00, 2.00, 7.00, 4.50, 2.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (40, 'mixed veg curry', 'मिक्स सब्ज़ी', 'vegetables', true, 85.00, 2.50, 9.00, 4.50, 3.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (41, 'cabbage sabzi', 'पत्तागोभी', 'vegetables', true, 65.00, 1.50, 8.00, 3.00, 2.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (42, 'baingan bharta', 'बैंगन भरता', 'vegetables', true, 108.00, 2.40, 8.00, 7.50, 3.20, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (43, 'tinda sabzi', 'टिंडा', 'vegetables', true, 40.00, 1.30, 6.00, 0.80, 1.80, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (44, 'carrot sabzi', 'गाजर', 'vegetables', true, 52.00, 1.00, 9.50, 1.00, 2.80, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (45, 'paneer full-fat', 'पनीर', 'dairy', true, 296.00, 20.00, 4.00, 22.00, 0.00, 50.00, '50g (~3 cubes)', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (46, 'paneer low-fat', 'लो-फैट पनीर', 'dairy', true, 160.00, 22.00, 4.00, 6.00, 0.00, 100.00, '100g (~7 cubes)', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (47, 'tofu firm', 'टोफू', 'dairy', true, 144.00, 17.00, 3.00, 9.00, 2.00, 100.00, '100g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (48, 'buffalo milk', 'भैंस का दूध', 'dairy', true, 97.00, 3.80, 5.00, 6.40, 0.00, 200.00, '1 glass (200ml)', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (49, 'cow milk full-fat', 'गाय का दूध', 'dairy', true, 61.00, 3.20, 4.80, 3.50, 0.00, 200.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (50, 'toned milk', 'टोन्ड दूध', 'dairy', true, 58.00, 3.10, 4.70, 3.00, 0.00, 200.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (51, 'double toned milk', 'डबल टोन्ड दूध', 'dairy', true, 49.00, 3.00, 4.80, 2.00, 0.00, 200.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (52, 'skim milk', 'स्किम दूध', 'dairy', true, 34.00, 3.40, 5.00, 0.20, 0.00, 200.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (53, 'curd full-fat', 'दही', 'dairy', true, 60.00, 3.10, 3.50, 4.00, 0.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (54, 'low-fat curd', 'लो-फैट दही', 'dairy', true, 40.00, 3.80, 5.00, 0.80, 0.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (55, 'hung curd', 'चक्का दही', 'dairy', true, 95.00, 8.00, 3.00, 5.00, 0.00, 100.00, '100g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (56, 'greek yogurt', 'ग्रीक योगर्ट', 'dairy', true, 59.00, 10.00, 3.60, 0.40, 0.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (57, 'buttermilk', 'छाछ', 'dairy', true, 25.00, 1.50, 2.50, 0.90, 0.00, 200.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (58, 'chicken breast grilled', 'ग्रिल्ड चिकन ब्रेस्ट', 'meat', false, 165.00, 31.00, 0.00, 3.60, 0.00, 150.00, '150g (~1 breast)', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (59, 'chicken thigh roasted', 'चिकन थाई', 'meat', false, 177.00, 24.00, 0.00, 9.00, 0.00, 150.00, '150g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (60, 'chicken tikka', 'चिकन टिक्का', 'meat', false, 195.00, 25.00, 4.00, 9.00, 0.50, 30.00, '1 piece', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (61, 'tandoori chicken', 'तंदूरी चिकन', 'meat', false, 170.00, 26.00, 2.00, 6.00, 0.30, 150.00, '150g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (62, 'rohu fish', 'रोहू', 'meat', false, 97.00, 16.80, 0.00, 2.90, 0.00, 150.00, '150g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (63, 'basa fish', 'बसा', 'meat', false, 90.00, 15.00, 0.00, 3.00, 0.00, 150.00, '150g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (64, 'salmon', 'सालमन', 'meat', false, 208.00, 22.00, 0.00, 13.00, 0.00, 150.00, '150g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (65, 'pomfret', 'पोम्फ्रेट', 'meat', false, 100.00, 18.00, 0.00, 3.00, 0.00, 150.00, '150g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (66, 'prawns cooked', 'झींगा', 'meat', false, 99.00, 24.00, 0.20, 0.30, 0.00, 150.00, '150g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (67, 'whole egg', 'अंडा', 'meat', false, 155.00, 13.00, 1.10, 11.00, 0.00, 50.00, '1 large egg', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (68, 'egg white', 'अंडे की सफेदी', 'meat', false, 52.00, 11.00, 0.70, 0.20, 0.00, 33.00, '1 egg white', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (69, 'boiled egg', 'उबला अंडा', 'meat', false, 155.00, 12.60, 1.10, 10.60, 0.00, 50.00, '1 egg', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (70, 'mutton curry cut', 'मटन', 'meat', false, 234.00, 25.00, 0.00, 14.00, 0.00, 100.00, '100g cooked', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (71, 'paneer bhurji', 'पनीर भुर्जी', 'prepared', true, 265.00, 17.00, 5.00, 20.00, 2.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (72, 'palak paneer', 'पालक पनीर', 'prepared', true, 180.00, 9.00, 7.00, 13.00, 3.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (73, 'dal tadka', 'दाल तड़का', 'prepared', true, 120.00, 6.50, 15.00, 4.00, 3.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (74, 'dal makhani', 'दाल मखनी', 'prepared', true, 185.00, 7.50, 18.00, 9.50, 5.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (75, 'chicken curry home', 'चिकन करी', 'prepared', false, 185.00, 16.00, 5.00, 11.00, 1.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (76, 'chicken biryani', 'चिकन बिरयानी', 'prepared', false, 165.00, 8.50, 20.00, 5.50, 1.20, 200.00, '1 plate', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (77, 'rajma chawal', 'राजमा चावल', 'prepared', true, 135.00, 5.00, 23.00, 2.50, 5.00, 250.00, '1 plate', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (78, 'chole', 'छोले', 'prepared', true, 155.00, 7.00, 20.00, 5.50, 6.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (79, 'sambhar', 'सांभर', 'prepared', true, 80.00, 3.50, 11.00, 2.50, 3.50, 200.00, '1 bowl', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (80, 'mixed veg korma', 'मिक्स वेज कोरमा', 'prepared', true, 140.00, 4.00, 12.00, 9.00, 3.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (81, 'matar paneer', 'मटर पनीर', 'prepared', true, 175.00, 8.00, 10.00, 12.00, 4.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (82, 'kadai paneer', 'कढ़ाई पनीर', 'prepared', true, 210.00, 11.00, 8.00, 15.00, 3.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (83, 'fish curry home', 'मछली करी', 'prepared', false, 130.00, 14.00, 4.00, 6.50, 1.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (84, 'egg curry', 'अंडा करी', 'prepared', false, 165.00, 10.00, 6.00, 11.00, 1.50, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (85, 'soya chunk curry', 'सोया करी', 'prepared', true, 145.00, 16.00, 10.00, 4.00, 5.00, 150.00, '1 katori', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (86, 'vegetable khichdi', 'खिचड़ी', 'prepared', true, 120.00, 4.00, 20.00, 2.50, 2.50, 200.00, '1 bowl', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (87, 'paneer tikka', 'पनीर टिक्का', 'prepared', true, 230.00, 16.00, 6.00, 16.00, 2.00, 150.00, '1 plate', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (88, 'banana', 'केला', 'fruits', true, 89.00, 1.10, 22.80, 0.30, 2.60, 100.00, '1 medium', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (89, 'apple', 'सेब', 'fruits', true, 52.00, 0.30, 13.80, 0.20, 2.40, 180.00, '1 medium', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (90, 'guava', 'अमरूद', 'fruits', true, 68.00, 2.60, 14.30, 0.90, 5.40, 120.00, '1 medium', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (91, 'papaya', 'पपीता', 'fruits', true, 43.00, 0.50, 10.80, 0.30, 1.70, 200.00, '1 bowl', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (92, 'orange', 'संतरा', 'fruits', true, 47.00, 0.90, 11.80, 0.10, 2.40, 130.00, '1 medium', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (93, 'mango ripe', 'आम', 'fruits', true, 60.00, 0.80, 15.00, 0.40, 1.60, 200.00, '1 medium', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (94, 'pear', 'नाशपाती', 'fruits', true, 57.00, 0.40, 15.00, 0.10, 3.10, 180.00, '1 medium', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (95, 'pomegranate', 'अनार', 'fruits', true, 83.00, 1.70, 18.70, 1.20, 4.00, 150.00, '1 bowl seeds', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (96, 'watermelon', 'तरबूज', 'fruits', true, 30.00, 0.60, 7.60, 0.20, 0.40, 200.00, '1 bowl', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (97, 'almonds', 'बादाम', 'snacks', true, 579.00, 21.20, 21.60, 49.90, 12.50, 20.00, '~15 almonds', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (98, 'walnuts', 'अखरोट', 'snacks', true, 654.00, 15.20, 13.70, 65.20, 6.70, 20.00, '~6 halves', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (99, 'peanuts raw', 'मूंगफली', 'snacks', true, 585.00, 23.70, 21.50, 49.70, 8.50, 30.00, '30g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (100, 'makhana', 'मखाना', 'snacks', true, 347.00, 9.70, 76.90, 0.10, 14.50, 30.00, '1 bowl', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (101, 'cashews', 'काजू', 'snacks', true, 553.00, 18.20, 30.20, 43.90, 3.30, 20.00, '~12 cashews', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (102, 'roasted chana', 'भुना चना', 'snacks', true, 369.00, 22.50, 54.50, 5.20, 18.00, 30.00, '30g', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (103, 'peanut butter', 'पीनट बटर', 'snacks', true, 588.00, 25.00, 20.00, 50.00, 6.00, 15.00, '1 tbsp', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (104, 'sprouts mixed', 'अंकुरित', 'snacks', true, 85.00, 7.60, 14.00, 0.70, 4.00, 100.00, '1 bowl', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (105, 'flax seeds', 'अलसी', 'snacks', true, 534.00, 18.30, 28.90, 42.20, 27.30, 10.00, '1 tbsp', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (106, 'chia seeds', 'चिया', 'snacks', true, 486.00, 16.50, 42.10, 30.70, 34.40, 10.00, '1 tbsp', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (107, 'dates', 'खजूर', 'snacks', true, 277.00, 1.80, 75.00, 0.20, 6.70, 24.00, '3 dates', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (108, 'chai with sugar', 'चीनी वाली चाय', 'beverages', true, 55.00, 1.30, 7.50, 2.10, 0.00, 200.00, '1 cup', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (109, 'chai without sugar', 'बिना चीनी की चाय', 'beverages', true, 30.00, 1.30, 1.50, 2.10, 0.00, 200.00, '1 cup', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (110, 'black coffee', 'ब्लैक कॉफी', 'beverages', true, 2.00, 0.10, 0.00, 0.00, 0.00, 200.00, '1 cup', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (111, 'green tea', 'ग्रीन टी', 'beverages', true, 1.00, 0.00, 0.00, 0.00, 0.00, 200.00, '1 cup', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (112, 'lemon water', 'नींबू पानी', 'beverages', true, 10.00, 0.10, 2.50, 0.00, 0.10, 250.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (113, 'coconut water', 'नारियल पानी', 'beverages', true, 19.00, 0.70, 3.70, 0.20, 1.10, 250.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (114, 'nimbu pani sweetened', 'शिकंजी', 'beverages', true, 45.00, 0.10, 11.00, 0.00, 0.00, 250.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (115, 'fresh orange juice', 'संतरे का रस', 'beverages', true, 45.00, 0.70, 10.40, 0.20, 0.20, 250.00, '1 glass', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (116, 'mustard oil', 'सरसों का तेल', 'oils', true, 884.00, 0.00, 0.00, 100.00, 0.00, 5.00, '1 tsp', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (117, 'olive oil', 'जैतून का तेल', 'oils', true, 884.00, 0.00, 0.00, 100.00, 0.00, 5.00, '1 tsp', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (118, 'ghee', 'घी', 'oils', true, 900.00, 0.00, 0.00, 100.00, 0.00, 5.00, '1 tsp', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (119, 'butter', 'मक्खन', 'oils', true, 717.00, 0.90, 0.10, 81.10, 0.00, 10.00, '1 tbsp', 'IFCT-2017', 'high');
INSERT INTO public.foods (id, name, name_hindi, category, is_veg, calories_per_100g, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_description, source, confidence) VALUES (120, 'coconut oil', 'नारियल तेल', 'oils', true, 899.00, 0.00, 0.00, 99.90, 0.00, 5.00, '1 tsp', 'IFCT-2017', 'high');


--
-- Data for Name: meals; Type: TABLE DATA; Schema: public; Owner: fit
--

INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (1, 1, 'breakfast', true, 'Oats + milk + almonds', '40g oats cooked with 250ml toned milk + 10 almonds', '[{"food": "oats dry", "grams": 40}, {"food": "toned milk", "grams": 250}, {"food": "almonds", "grams": 12}]', 430, 20);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (2, 1, 'breakfast', false, '3-egg omelette + toast', '1 yolk + 2 whites omelette, 2 multigrain toast, 200ml milk', '[{"food": "whole egg", "grams": 50}, {"food": "egg white", "grams": 66}, {"food": "multigrain bread slice", "grams": 60}, {"food": "toned milk", "grams": 200}]', 420, 33);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (3, 1, 'mid-morning', true, 'Apple + almonds', '1 apple + 20g almonds', '[{"food": "apple", "grams": 180}, {"food": "almonds", "grams": 20}]', 200, 5);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (4, 1, 'lunch', true, 'Roti + dal + paneer bhurji', '2 rotis, 1 katori moong dal, paneer bhurji, salad, curd', '[{"food": "roti", "grams": 70}, {"food": "moong dal cooked", "grams": 150}, {"food": "paneer bhurji", "grams": 150}, {"food": "low-fat curd", "grams": 100}]', 560, 38);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (5, 1, 'lunch', false, 'Roti + dal + grilled chicken', '2 rotis, dal, 150g grilled chicken, sabzi, salad', '[{"food": "roti", "grams": 70}, {"food": "moong dal cooked", "grams": 150}, {"food": "chicken breast grilled", "grams": 150}, {"food": "palak sabzi", "grams": 100}]', 550, 45);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (6, 1, 'snack', true, 'Roasted chana + green tea', '30g roasted chana + green tea', '[{"food": "roasted chana", "grams": 30}, {"food": "green tea", "grams": 200}]', 120, 7);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (7, 1, 'post-workout', true, 'Boiled eggs + banana', '2 boiled eggs + 1 banana', '[{"food": "boiled egg", "grams": 100}, {"food": "banana", "grams": 100}]', 240, 14);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (8, 1, 'dinner', true, 'Brown rice + rajma + lauki + curd', '1 katori brown rice, rajma, lauki sabzi, hung curd', '[{"food": "brown rice cooked", "grams": 150}, {"food": "rajma cooked", "grams": 150}, {"food": "lauki sabzi", "grams": 150}, {"food": "hung curd", "grams": 80}]', 510, 25);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (9, 1, 'dinner', false, 'Roti + fish + palak dal', '1 roti, 100g grilled rohu, palak dal, salad', '[{"food": "roti", "grams": 35}, {"food": "rohu fish", "grams": 150}, {"food": "moong dal cooked", "grams": 150}]', 450, 35);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (10, 2, 'breakfast', true, 'Besan chilla + hung curd', '2 besan chillas + 150g hung curd', '[{"food": "besan chilla", "grams": 160}, {"food": "hung curd", "grams": 150}]', 420, 33);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (11, 2, 'breakfast', false, 'Egg bhurji + toast', '3-egg bhurji, 2 multigrain toast, skim milk', '[{"food": "whole egg", "grams": 150}, {"food": "multigrain bread slice", "grams": 60}, {"food": "skim milk", "grams": 200}]', 430, 32);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (12, 2, 'mid-morning', true, 'Pear + buttermilk', '1 pear + 200ml buttermilk', '[{"food": "pear", "grams": 180}, {"food": "buttermilk", "grams": 200}]', 130, 4);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (13, 2, 'lunch', true, 'Brown rice + chana dal + tofu', '1 katori brown rice, chana dal, tofu stir-fry, salad', '[{"food": "brown rice cooked", "grams": 150}, {"food": "chana dal cooked", "grams": 150}, {"food": "tofu firm", "grams": 100}]', 550, 35);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (14, 2, 'lunch', false, 'Rice + chicken curry + raita', '1 katori brown rice, chicken curry (100g chicken), raita', '[{"food": "brown rice cooked", "grams": 150}, {"food": "chicken curry home", "grams": 150}, {"food": "low-fat curd", "grams": 100}]', 560, 42);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (15, 2, 'snack', true, 'Buttermilk + makhana', '1 glass buttermilk + 30g makhana', '[{"food": "buttermilk", "grams": 200}, {"food": "makhana", "grams": 30}]', 130, 5);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (16, 2, 'post-workout', true, 'Greek yogurt + apple + almonds', '200g Greek yogurt, 1 apple, 10 almonds', '[{"food": "greek yogurt", "grams": 200}, {"food": "apple", "grams": 180}, {"food": "almonds", "grams": 12}]', 280, 22);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (17, 2, 'dinner', true, 'Paneer tikka + roti + salad', '150g air-fried low-fat paneer tikka, 2 rotis, salad', '[{"food": "paneer low-fat", "grams": 150}, {"food": "roti", "grams": 70}]', 520, 40);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (18, 2, 'dinner', false, 'Fish tikka + roti + veg', '150g grilled fish tikka, 2 rotis, sautéed veg', '[{"food": "basa fish", "grams": 150}, {"food": "roti", "grams": 70}, {"food": "mixed veg curry", "grams": 150}]', 480, 35);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (19, 3, 'breakfast', true, 'Moong dal chilla + paneer', '2 moong dal chillas with 100g paneer stuffing', '[{"food": "moong dal chilla", "grams": 160}, {"food": "paneer low-fat", "grams": 100}]', 430, 32);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (20, 3, 'breakfast', false, 'Eggs + poha + milk', '2 boiled eggs, vegetable poha, 1 cup milk', '[{"food": "boiled egg", "grams": 100}, {"food": "poha", "grams": 150}, {"food": "toned milk", "grams": 200}]', 440, 25);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (21, 3, 'mid-morning', true, 'Guava + walnuts', '1 guava + 15g walnuts', '[{"food": "guava", "grams": 120}, {"food": "walnuts", "grams": 15}]', 180, 4);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (22, 3, 'lunch', true, 'Jowar roti + toor dal + bhindi', '2 jowar rotis, toor dal, bhindi sabzi, curd', '[{"food": "jowar roti", "grams": 80}, {"food": "toor dal cooked", "grams": 150}, {"food": "bhindi sabzi", "grams": 150}, {"food": "low-fat curd", "grams": 100}]', 540, 25);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (23, 3, 'lunch', false, 'Rice + tandoori chicken + dal', '1 katori rice, 150g tandoori chicken, dal, salad', '[{"food": "brown rice cooked", "grams": 150}, {"food": "tandoori chicken", "grams": 150}, {"food": "moong dal cooked", "grams": 150}]', 560, 50);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (24, 3, 'snack', true, 'Sprouts chaat', '1 bowl sprouts with onion, tomato, lemon', '[{"food": "sprouts mixed", "grams": 150}]', 140, 8);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (25, 3, 'post-workout', true, 'Paneer cubes + cucumber', '150g low-fat paneer cubes + cucumber sticks', '[{"food": "paneer low-fat", "grams": 150}]', 240, 33);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (26, 3, 'dinner', true, 'Soya chunk curry + roti', 'Soya chunk curry (30g dry → 90g soaked) + 1 roti', '[{"food": "soya chunk curry", "grams": 200}, {"food": "roti", "grams": 35}]', 470, 28);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (27, 3, 'dinner', false, 'Fish curry + roti + veg', 'Fish curry (150g rohu), 1 roti, steamed veg', '[{"food": "fish curry home", "grams": 200}, {"food": "roti", "grams": 35}, {"food": "mixed veg curry", "grams": 150}]', 490, 32);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (28, 4, 'breakfast', true, 'Upma + yogurt + almonds', 'Vegetable upma (40g sooji), 150g Greek yogurt, 10 almonds', '[{"food": "upma", "grams": 200}, {"food": "greek yogurt", "grams": 150}, {"food": "almonds", "grams": 12}]', 450, 22);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (29, 4, 'breakfast', false, 'Egg white omelette + toast', '4 egg whites + 1 whole egg omelette, 2 slices brown bread', '[{"food": "egg white", "grams": 132}, {"food": "whole egg", "grams": 50}, {"food": "brown bread slice", "grams": 60}]', 380, 32);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (30, 4, 'mid-morning', true, 'Orange + roasted peanuts', '1 orange + 20g peanuts', '[{"food": "orange", "grams": 130}, {"food": "peanuts raw", "grams": 20}]', 170, 5);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (31, 4, 'lunch', true, 'Roti + masoor dal + paneer bhurji', '2 rotis, masoor dal, paneer bhurji, curd', '[{"food": "roti", "grams": 70}, {"food": "masoor dal cooked", "grams": 150}, {"food": "paneer bhurji", "grams": 150}]', 570, 35);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (32, 4, 'lunch', false, 'Roti + dal + chicken bhuna', '2 rotis, dal, chicken bhuna (150g), raita', '[{"food": "roti", "grams": 70}, {"food": "moong dal cooked", "grams": 150}, {"food": "chicken curry home", "grams": 150}, {"food": "low-fat curd", "grams": 80}]', 560, 45);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (33, 4, 'snack', true, 'Flax seed chai + date', '1 cup chai without sugar, 1 tbsp flax, 1 date', '[{"food": "chai without sugar", "grams": 200}, {"food": "flax seeds", "grams": 10}, {"food": "dates", "grams": 10}]', 100, 3);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (34, 4, 'post-workout', true, 'Curd + banana', '200g low-fat curd + 1 banana', '[{"food": "low-fat curd", "grams": 200}, {"food": "banana", "grams": 100}]', 170, 9);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (35, 4, 'dinner', true, 'Quinoa khichdi + raita', 'Quinoa khichdi (50g quinoa + dal + veg) + raita', '[{"food": "quinoa cooked", "grams": 200}, {"food": "moong dal cooked", "grams": 100}, {"food": "low-fat curd", "grams": 80}]', 500, 22);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (36, 4, 'dinner', false, 'Prawns + rice + salad', '150g grilled prawns, 1 katori brown rice, salad', '[{"food": "prawns cooked", "grams": 150}, {"food": "brown rice cooked", "grams": 150}]', 460, 40);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (37, 5, 'breakfast', true, 'Idli + sambar + chutney', '3 idlis, sambar, 1 tbsp coconut chutney', '[{"food": "idli", "grams": 105}, {"food": "sambhar", "grams": 200}]', 420, 15);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (38, 5, 'breakfast', false, 'Idli + sambar + eggs', '2 idlis, sambar, 2 boiled eggs', '[{"food": "idli", "grams": 70}, {"food": "sambhar", "grams": 200}, {"food": "boiled egg", "grams": 100}]', 430, 22);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (39, 5, 'mid-morning', true, 'Chai + makhana', 'Chai without sugar + 30g makhana', '[{"food": "chai without sugar", "grams": 200}, {"food": "makhana", "grams": 30}]', 130, 4);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (40, 5, 'lunch', true, 'Rajma chawal + salad + curd', '1 katori rajma + 1 katori brown rice + salad + curd', '[{"food": "rajma cooked", "grams": 150}, {"food": "brown rice cooked", "grams": 150}, {"food": "low-fat curd", "grams": 100}]', 580, 26);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (41, 5, 'lunch', false, 'Home chicken biryani + raita', 'Home biryani (120g chicken, 100g rice) + raita, minimal oil', '[{"food": "chicken biryani", "grams": 300}, {"food": "low-fat curd", "grams": 80}]', 620, 38);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (42, 5, 'snack', true, 'Coconut water + almonds', '1 glass coconut water + 15g almonds', '[{"food": "coconut water", "grams": 250}, {"food": "almonds", "grams": 15}]', 130, 4);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (43, 5, 'post-workout', true, 'Greek yogurt + guava', '200g Greek yogurt + 1 guava', '[{"food": "greek yogurt", "grams": 200}, {"food": "guava", "grams": 120}]', 200, 23);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (44, 5, 'dinner', true, 'Roti + palak paneer + salad', '2 rotis, palak-paneer (100g low-fat paneer), salad', '[{"food": "roti", "grams": 70}, {"food": "palak paneer", "grams": 200}]', 540, 30);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (45, 5, 'dinner', false, 'Roti + chicken keema-mutter', '2 rotis, chicken keema with peas (100g lean mince), salad', '[{"food": "roti", "grams": 70}, {"food": "chicken curry home", "grams": 200}]', 550, 40);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (46, 6, 'breakfast', true, 'Oats banana peanut butter pancake', '50g oats, banana, 1 tbsp peanut butter blended and cooked', '[{"food": "oats dry", "grams": 50}, {"food": "banana", "grams": 100}, {"food": "peanut butter", "grams": 15}]', 450, 18);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (47, 6, 'breakfast', false, 'Avocado toast + poached eggs', '2 slices brown bread, ½ avocado, 2 poached eggs', '[{"food": "brown bread slice", "grams": 60}, {"food": "whole egg", "grams": 100}]', 480, 22);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (48, 6, 'mid-morning', true, 'Pomegranate bowl', '1 bowl pomegranate + 15g walnuts', '[{"food": "pomegranate", "grams": 150}, {"food": "walnuts", "grams": 15}]', 200, 4);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (49, 6, 'lunch', true, 'Roti + mixed dal + sabzi + curd', '2 rotis, mixed dal, mixed sabzi, 150g hung curd, salad', '[{"food": "roti", "grams": 70}, {"food": "mixed dal", "grams": 150}, {"food": "mixed veg curry", "grams": 150}, {"food": "hung curd", "grams": 120}]', 570, 30);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (50, 6, 'lunch', false, 'Roti + dal + grilled chicken', 'Veg lunch plus 100g grilled chicken replacing hung curd', '[{"food": "roti", "grams": 70}, {"food": "mixed dal", "grams": 150}, {"food": "mixed veg curry", "grams": 150}, {"food": "chicken breast grilled", "grams": 100}]', 610, 42);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (51, 6, 'snack', true, 'Green tea + roasted chana', 'Green tea + 30g roasted chana', '[{"food": "green tea", "grams": 200}, {"food": "roasted chana", "grams": 30}]', 115, 7);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (52, 6, 'post-workout', true, 'Whey-free smoothie', '200ml milk + 1 banana + 1 tbsp peanut butter', '[{"food": "toned milk", "grams": 200}, {"food": "banana", "grams": 100}, {"food": "peanut butter", "grams": 15}]', 330, 13);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (53, 6, 'dinner', true, 'Soya pulao + raita', 'Soya pulao (30g dry soya + 50g brown rice + veg) + raita', '[{"food": "soya chunk curry", "grams": 150}, {"food": "brown rice cooked", "grams": 100}, {"food": "low-fat curd", "grams": 80}]', 520, 28);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (54, 6, 'dinner', false, 'Pomfret + roti + veg', 'Fish curry (150g pomfret), 1 roti, sautéed veg', '[{"food": "pomfret", "grams": 150}, {"food": "roti", "grams": 35}, {"food": "mixed veg curry", "grams": 150}]', 470, 35);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (55, 7, 'breakfast', true, 'Paneer paratha + curd', '2 stuffed paneer parathas (small, 1 tsp ghee) + 150g curd', '[{"food": "paratha plain", "grams": 120}, {"food": "paneer low-fat", "grams": 80}, {"food": "low-fat curd", "grams": 150}]', 600, 28);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (56, 7, 'breakfast', false, 'Masala omelette + aloo paratha + milk', '3-egg masala omelette, 1 small aloo paratha, milk', '[{"food": "whole egg", "grams": 150}, {"food": "aloo paratha", "grams": 120}, {"food": "toned milk", "grams": 200}]', 620, 28);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (57, 7, 'mid-morning', true, 'Watermelon', '1 bowl watermelon', '[{"food": "watermelon", "grams": 250}]', 80, 2);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (58, 7, 'lunch', true, 'Refeed plate: paneer tikka + tandoori roti + dal + raita', '150g paneer tikka, 1 tandoori roti, dal tadka, kachumber, raita', '[{"food": "paneer tikka", "grams": 150}, {"food": "roti", "grams": 40}, {"food": "dal tadka", "grams": 150}, {"food": "low-fat curd", "grams": 80}]', 650, 38);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (59, 7, 'lunch', false, 'Refeed plate: chicken tikka + roti + dal + raita', '150g chicken tikka, 1 tandoori roti, dal tadka, kachumber, raita', '[{"food": "chicken tikka", "grams": 150}, {"food": "roti", "grams": 40}, {"food": "dal tadka", "grams": 150}, {"food": "low-fat curd", "grams": 80}]', 620, 48);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (60, 7, 'snack', true, 'Lemon water + almonds', '1 glass nimbu pani + 15g almonds', '[{"food": "lemon water", "grams": 250}, {"food": "almonds", "grams": 15}]', 130, 4);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (61, 7, 'post-workout', true, 'Skim milk + chia', '250ml skim milk + 1 tbsp chia', '[{"food": "skim milk", "grams": 250}, {"food": "chia seeds", "grams": 10}]', 130, 10);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (62, 7, 'dinner', true, 'Multigrain roti + mixed dal + sabzi', '2 multigrain rotis, mixed dal, sabzi, salad — lighter refeed dinner', '[{"food": "roti", "grams": 70}, {"food": "mixed dal", "grams": 150}, {"food": "mixed veg curry", "grams": 150}]', 490, 22);
INSERT INTO public.meals (id, day_of_week, meal_type, is_veg_option, name, description, foods_json, target_calories, target_protein_g) VALUES (63, 7, 'dinner', false, 'Grilled fish + roti + salad + curd', '150g grilled fish, 1 roti, salad, curd', '[{"food": "basa fish", "grams": 150}, {"food": "roti", "grams": 35}, {"food": "low-fat curd", "grams": 100}]', 470, 34);


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: fit
--

INSERT INTO public.users (id, name, email, pin_hash, height_cm, current_weight_kg, target_weight_kg, birth_date, diet_preference, daily_calorie_target, daily_protein_target_g, daily_carbs_target_g, daily_fat_target_g, daily_water_target_ml, timezone, created_at, updated_at) VALUES ('8cf5909d-3ef5-445d-a9d1-74629f2ebb54', 'Prateek', 'prateek@fit.local', '$2a$10$rpo1cMMiR/vj1gzEgfd4H.k2g0BhvGy35/qrYHj0WWT944OKxTLxa', 172.0, 92.00, 80.00, '1990-09-15', 'mixed', 1900, 170, 180, 50, 3750, 'Asia/Kolkata', '2026-04-23 14:41:24.381+00', '2026-04-23 16:16:47.632+00');


--
-- Data for Name: workouts; Type: TABLE DATA; Schema: public; Owner: fit
--

INSERT INTO public.workouts (id, day_number, name, category, exercises_json, duration_min, description) VALUES (1, 1, 'Push — Chest, Shoulders, Triceps', 'push', '[{"reps": "8-12", "sets": 4, "slug": "push-up-incline", "rest_sec": 90}, {"reps": "6-10", "sets": 3, "slug": "push-up-decline", "rest_sec": 90}, {"reps": "10-12", "sets": 3, "slug": "db-bench-press", "rest_sec": 90}, {"reps": "10-12", "sets": 3, "slug": "db-shoulder-press", "rest_sec": 90}, {"reps": "8-12", "sets": 3, "slug": "pike-push-up", "rest_sec": 75}, {"reps": "12-15", "sets": 3, "slug": "db-lateral-raise", "rest_sec": 60}, {"reps": "10-12", "sets": 3, "slug": "overhead-tricep-extension", "rest_sec": 60}, {"reps": "12-15", "sets": 2, "slug": "chair-dip", "rest_sec": 60}]', 45, 'Upper-body push day. Emphasizes upper chest with decline push-up to fix puffy-chest look.');
INSERT INTO public.workouts (id, day_number, name, category, exercises_json, duration_min, description) VALUES (2, 2, 'Pull — Back, Rear Delts, Biceps', 'pull', '[{"reps": "5-10", "sets": 4, "slug": "inverted-row", "rest_sec": 90}, {"reps": "10-12", "sets": 4, "slug": "bent-over-db-row", "rest_sec": 90}, {"reps": "10-12/arm", "sets": 3, "slug": "single-arm-row", "rest_sec": 75}, {"reps": "15", "sets": 3, "slug": "band-face-pull", "rest_sec": 45}, {"reps": "10-12", "sets": 3, "slug": "db-curl", "rest_sec": 60}, {"reps": "12", "sets": 2, "slug": "hammer-curl", "rest_sec": 60}, {"reps": "12-15", "sets": 3, "slug": "reverse-fly", "rest_sec": 45}, {"reps": "20-30s hold", "sets": 3, "slug": "superman", "rest_sec": 45}]', 45, 'Critical desk-worker day — band face-pulls reverse shoulder roll from sitting.');
INSERT INTO public.workouts (id, day_number, name, category, exercises_json, duration_min, description) VALUES (3, 3, 'Legs & Glutes', 'legs', '[{"reps": "12-15", "sets": 4, "slug": "bw-squat", "rest_sec": 75}, {"reps": "10-12", "sets": 3, "slug": "goblet-squat", "rest_sec": 90}, {"reps": "10/leg", "sets": 3, "slug": "walking-lunge", "rest_sec": 75}, {"reps": "10-12", "sets": 3, "slug": "db-rdl", "rest_sec": 90}, {"reps": "12-15", "sets": 3, "slug": "glute-bridge", "rest_sec": 60}, {"reps": "15-20", "sets": 3, "slug": "calf-raise", "rest_sec": 45}, {"reps": "30-60s", "sets": 2, "slug": "wall-sit", "rest_sec": 60}]', 50, 'Lower-body day. Box-squat chair if knee pain (start at 92 kg).');
INSERT INTO public.workouts (id, day_number, name, category, exercises_json, duration_min, description) VALUES (4, 4, 'HIIT + Core', 'hiit', '[{"reps": "20s on / 10s off × 4 rounds", "sets": 2, "slug": "jumping-jack", "rest_sec": 60}, {"reps": "20s on / 10s off × 4 rounds", "sets": 2, "slug": "mountain-climber", "rest_sec": 60}, {"reps": "20s on / 10s off × 4 rounds", "sets": 2, "slug": "high-knees", "rest_sec": 60}, {"reps": "20s on / 10s off × 4 rounds", "sets": 2, "slug": "skater-jump", "rest_sec": 60}, {"reps": "10/side", "sets": 3, "slug": "dead-bug", "rest_sec": 45}, {"reps": "30-60s", "sets": 3, "slug": "plank", "rest_sec": 45}, {"reps": "20-40s/side", "sets": 2, "slug": "side-plank", "rest_sec": 45}, {"reps": "10/side", "sets": 3, "slug": "bird-dog", "rest_sec": 45}, {"reps": "15/side", "sets": 3, "slug": "bicycle-crunch", "rest_sec": 45}]', 25, 'Tabata-style 20/10. Use 30/30 in weeks 1-2 to protect joints.');
INSERT INTO public.workouts (id, day_number, name, category, exercises_json, duration_min, description) VALUES (5, 5, 'Full Body Strength', 'fullbody', '[{"reps": "10", "sets": 4, "slug": "goblet-squat", "rest_sec": 90}, {"reps": "AMRAP-2", "sets": 4, "slug": "push-up", "rest_sec": 75}, {"reps": "10/arm", "sets": 4, "slug": "single-arm-row", "rest_sec": 75}, {"reps": "12", "sets": 3, "slug": "db-rdl", "rest_sec": 90}, {"reps": "10", "sets": 3, "slug": "db-thruster", "rest_sec": 90}, {"reps": "AMRAP", "sets": 3, "slug": "inverted-row", "rest_sec": 75}, {"reps": "45-60s", "sets": 3, "slug": "plank", "rest_sec": 45}]', 45, 'Compound-heavy day. DB thruster is a calorie-burner.');
INSERT INTO public.workouts (id, day_number, name, category, exercises_json, duration_min, description) VALUES (6, 6, 'Cardio + Mobility', 'cardio', '[{"reps": "45 min brisk walk OR 10×(1 min rope + 30s rest) OR 10×2 min shadow box", "sets": 1, "slug": "running-in-place", "rest_sec": 0}, {"reps": "1 min", "sets": 10, "slug": "jumping-rope", "rest_sec": 30}, {"reps": "2 min rounds", "sets": 10, "slug": "shadow-boxing", "rest_sec": 60}, {"reps": "45s", "sets": 3, "slug": "plank", "rest_sec": 45}]', 60, 'Pick one low-impact option. At 92 kg: WALK — do not run — for weeks 1-6.');
INSERT INTO public.workouts (id, day_number, name, category, exercises_json, duration_min, description) VALUES (7, 7, 'Rest / Active Recovery', 'rest', '[]', 30, '20-30 min gentle walk, full-body stretch, 8 hrs sleep.');


--
-- Name: exercises_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fit
--

SELECT pg_catalog.setval('public.exercises_id_seq', 150, true);


--
-- Name: foods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fit
--

SELECT pg_catalog.setval('public.foods_id_seq', 120, true);


--
-- Name: meals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fit
--

SELECT pg_catalog.setval('public.meals_id_seq', 63, true);


--
-- Name: workouts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fit
--

SELECT pg_catalog.setval('public.workouts_id_seq', 7, true);


--
-- PostgreSQL database dump complete
--

\unrestrict YGZbLVsTdZKFjiSqzy8yhAXUB4MpacvQ3l0vIXjTGYwPmgcQsFQSdKtgnVHWirH


-- pg_dump above may have left search_path pointing somewhere obscure;
-- pin it back to public for the rest of the script.
SET search_path = public;

-- Advance auto-increment sequences past seeded rows.
SELECT setval('foods_id_seq',     COALESCE((SELECT MAX(id) FROM foods),     1), true);
SELECT setval('exercises_id_seq', COALESCE((SELECT MAX(id) FROM exercises), 1), true);
SELECT setval('meals_id_seq',     COALESCE((SELECT MAX(id) FROM meals),     1), true);
SELECT setval('workouts_id_seq',  COALESCE((SELECT MAX(id) FROM workouts),  1), true);

-- Mark the init migration as applied so future `prisma migrate deploy`
-- calls don't try to re-run it. The checksum is informational; Prisma
-- will re-checksum and update if needed.
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'bootstrap-applied-via-neon-sql-editor',
  CURRENT_TIMESTAMP,
  '20260423130000_init',
  CURRENT_TIMESTAMP,
  1
)
ON CONFLICT DO NOTHING;
