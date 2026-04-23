// Phase 1 seed loader.
//
// Reads prisma/seed/{foods,exercises,meals,workouts}.json and upserts them
// into the corresponding tables. Idempotent — safe to re-run.
//
// Invoke with: pnpm db:seed  (aliased to `prisma db seed` in package.json)

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

const DEFAULT_PIN = "123456";

type FoodSeed = {
  name: string;
  name_hindi?: string | null;
  category: string;
  is_veg: boolean;
  calories_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  serving_size_g: number;
  serving_description?: string | null;
  source?: string;
  confidence?: string;
};

type ExerciseSeed = {
  name: string;
  slug: string;
  category: string;
  muscle_groups: string[];
  equipment_needed?: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  image_url?: string;
  youtube_id?: string;
  attribution?: string;
  instructions: string;
  form_cue?: string;
  common_mistakes?: string;
};

type MealSeed = {
  day_of_week: number;
  meal_type: string;
  is_veg_option: boolean;
  name: string;
  description?: string;
  foods_json: Array<{ food: string; grams: number }>;
  target_calories?: number;
  target_protein_g?: number;
};

type WorkoutSeed = {
  day_number: number;
  name: string;
  category: string;
  duration_min: number;
  description?: string;
  exercises_json: Array<{
    slug?: string;
    sets?: number;
    reps?: string | number;
    rest_sec?: number;
  }>;
};

function readJson<T>(file: string): T {
  const path = join(__dirname, "seed", file);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function seedFoods() {
  const foods = readJson<FoodSeed[]>("foods.json");
  console.log(`→ Seeding ${foods.length} foods…`);
  // Idempotent: delete-all then insert. foods has no outbound FKs from other seed tables.
  // food_logs.food_id is nullable / SET NULL on delete, so this is safe even with user data.
  await prisma.$transaction([
    prisma.food.deleteMany({}),
    prisma.$executeRawUnsafe('ALTER SEQUENCE "foods_id_seq" RESTART WITH 1'),
  ]);
  await prisma.food.createMany({
    data: foods.map((f) => ({
      name: f.name,
      nameHindi: f.name_hindi ?? null,
      category: f.category,
      isVeg: f.is_veg,
      caloriesPer100g: new Prisma.Decimal(f.calories_per_100g),
      proteinG: new Prisma.Decimal(f.protein_g),
      carbsG: new Prisma.Decimal(f.carbs_g),
      fatG: new Prisma.Decimal(f.fat_g),
      fiberG: f.fiber_g != null ? new Prisma.Decimal(f.fiber_g) : null,
      servingSizeG: new Prisma.Decimal(f.serving_size_g),
      servingDescription: f.serving_description ?? null,
      source: f.source ?? "IFCT-2017",
      confidence: f.confidence ?? "high",
    })),
  });
  const count = await prisma.food.count();
  console.log(`  ✓ foods: ${count}`);
}

async function seedExercises() {
  const exercises = readJson<ExerciseSeed[]>("exercises.json");
  console.log(`→ Seeding ${exercises.length} exercises…`);
  for (const e of exercises) {
    await prisma.exercise.upsert({
      where: { slug: e.slug },
      create: {
        name: e.name,
        slug: e.slug,
        category: e.category,
        muscleGroups: e.muscle_groups,
        equipmentNeeded: e.equipment_needed ?? [],
        difficulty: e.difficulty ?? null,
        imageUrl: e.image_url ?? null,
        youtubeId: e.youtube_id ?? null,
        attribution: e.attribution ?? null,
        instructions: e.instructions,
        formCue: e.form_cue ?? null,
        commonMistakes: e.common_mistakes ?? null,
      },
      update: {
        name: e.name,
        category: e.category,
        muscleGroups: e.muscle_groups,
        equipmentNeeded: e.equipment_needed ?? [],
        difficulty: e.difficulty ?? null,
        imageUrl: e.image_url ?? null,
        youtubeId: e.youtube_id ?? null,
        attribution: e.attribution ?? null,
        instructions: e.instructions,
        formCue: e.form_cue ?? null,
        commonMistakes: e.common_mistakes ?? null,
      },
    });
  }
  const count = await prisma.exercise.count();
  console.log(`  ✓ exercises: ${count}`);
}

async function seedMeals() {
  const meals = readJson<MealSeed[]>("meals.json");
  const foods = readJson<FoodSeed[]>("foods.json");
  const foodNames = new Set(foods.map((f) => f.name));
  // Validate every food reference resolves before touching the DB.
  const unresolved = meals.flatMap((m) =>
    m.foods_json
      .filter((x) => !foodNames.has(x.food))
      .map((x) => ({ meal: m.name, food: x.food })),
  );
  if (unresolved.length) {
    throw new Error(
      `meals.json references unknown foods:\n${JSON.stringify(unresolved, null, 2)}`,
    );
  }
  console.log(`→ Seeding ${meals.length} meals…`);
  await prisma.$transaction([
    prisma.meal.deleteMany({}),
    prisma.$executeRawUnsafe('ALTER SEQUENCE "meals_id_seq" RESTART WITH 1'),
  ]);
  await prisma.meal.createMany({
    data: meals.map((m) => ({
      dayOfWeek: m.day_of_week,
      mealType: m.meal_type,
      isVegOption: m.is_veg_option,
      name: m.name,
      description: m.description ?? null,
      foodsJson: m.foods_json as unknown as Prisma.InputJsonValue,
      targetCalories: m.target_calories ?? null,
      targetProteinG: m.target_protein_g ?? null,
    })),
  });
  const count = await prisma.meal.count();
  console.log(`  ✓ meals: ${count}`);
}

async function seedWorkouts() {
  const workouts = readJson<WorkoutSeed[]>("workouts.json");
  const exercises = readJson<ExerciseSeed[]>("exercises.json");
  const slugs = new Set(exercises.map((e) => e.slug));
  const unresolved = workouts.flatMap((w) =>
    w.exercises_json
      .filter((x) => x.slug && !slugs.has(x.slug))
      .map((x) => ({ day: w.day_number, slug: x.slug })),
  );
  if (unresolved.length) {
    throw new Error(
      `workouts.json references unknown exercise slugs:\n${JSON.stringify(unresolved, null, 2)}`,
    );
  }
  console.log(`→ Seeding ${workouts.length} workouts…`);
  await prisma.$transaction([
    prisma.workout.deleteMany({}),
    prisma.$executeRawUnsafe('ALTER SEQUENCE "workouts_id_seq" RESTART WITH 1'),
  ]);
  await prisma.workout.createMany({
    data: workouts.map((w) => ({
      dayNumber: w.day_number,
      name: w.name,
      category: w.category,
      durationMin: w.duration_min,
      description: w.description ?? null,
      exercisesJson: w.exercises_json as unknown as Prisma.InputJsonValue,
    })),
  });
  const count = await prisma.workout.count();
  console.log(`  ✓ workouts: ${count}`);
}

async function seedUser() {
  const email = "prateek@fit.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`→ User already exists (id=${existing.id}) — leaving PIN untouched.`);
    return;
  }
  const pinHash = await bcrypt.hash(DEFAULT_PIN, 10);
  const user = await prisma.user.create({
    data: {
      name: "Prateek",
      email,
      pinHash,
      heightCm: new Prisma.Decimal(172),
      currentWeightKg: new Prisma.Decimal(92),
      targetWeightKg: new Prisma.Decimal(80),
      birthDate: new Date("1990-09-15"),
      dietPreference: "mixed",
      dailyCalorieTarget: 1900,
      dailyProteinTargetG: 170,
      dailyCarbsTargetG: 180,
      dailyFatTargetG: 50,
      dailyWaterTargetMl: 3750,
      timezone: "Asia/Kolkata",
    },
  });
  console.log(`→ Created user id=${user.id} name=${user.name} pin=${DEFAULT_PIN}`);
}

async function main() {
  console.log("Seeding Fit database…");
  await seedFoods();
  await seedExercises();
  await seedMeals();
  await seedWorkouts();
  await seedUser();
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
