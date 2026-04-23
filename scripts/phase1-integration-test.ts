/**
 * Phase 1 integration test — wipes test data then exercises the whole schema:
 *   - create a User
 *   - fuzzy-search foods via pg_trgm word_similarity
 *   - insert FoodLog, WaterLog, WeightLog
 *   - REFRESH MATERIALIZED VIEW daily_totals + query it
 *   - create a WorkoutLog
 *   - clean up
 *
 * Run with: pnpm tsx scripts/phase1-integration-test.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pin = "123456";
  const pinHash = await bcrypt.hash(pin, 10);

  console.log("1. create user");
  const user = await prisma.user.create({
    data: {
      name: "Test User",
      email: `test-${Date.now()}@example.com`,
      pinHash,
      heightCm: new Prisma.Decimal(172),
      currentWeightKg: new Prisma.Decimal(92),
      targetWeightKg: new Prisma.Decimal(80),
      birthDate: new Date("1990-09-15"),
      dietPreference: "mixed",
    },
  });
  console.log("   user.id =", user.id);

  console.log("2. fuzzy food search (panner → paneer)");
  await prisma.$executeRawUnsafe(`SET pg_trgm.word_similarity_threshold = 0.35`);
  const hits = await prisma.$queryRaw<Array<{ id: number; name: string; sim: number }>>`
    SELECT id, name, word_similarity('panner', name)::float AS sim
    FROM foods
    WHERE 'panner' <% name
    ORDER BY sim DESC
    LIMIT 3
  `;
  console.log("   ", hits);
  if (hits.length === 0) throw new Error("fuzzy search returned 0 rows");

  console.log("3. full-text search ('rajma')");
  const fts = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
    SELECT id, name FROM foods
    WHERE search_tokens @@ plainto_tsquery('simple', 'rajma')
  `;
  console.log("   ", fts);
  if (fts.length === 0) throw new Error("tsvector search returned 0 rows");

  console.log("4. log 3 foods");
  const today = new Date();
  const logDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const paneer = await prisma.food.findFirstOrThrow({ where: { name: "paneer low-fat" } });
  const rice = await prisma.food.findFirstOrThrow({ where: { name: "brown rice cooked" } });
  const rajma = await prisma.food.findFirstOrThrow({ where: { name: "rajma cooked" } });

  function macros(food: typeof paneer, grams: number) {
    const factor = grams / 100;
    return {
      portionG: new Prisma.Decimal(grams),
      calories: food.caloriesPer100g.mul(factor),
      proteinG: food.proteinG.mul(factor),
      carbsG: food.carbsG.mul(factor),
      fatG: food.fatG.mul(factor),
    };
  }

  await prisma.foodLog.createMany({
    data: [
      {
        userId: user.id,
        logDate,
        foodId: paneer.id,
        foodName: paneer.name,
        ...macros(paneer, 150),
        source: "manual",
        mealType: "lunch",
      },
      {
        userId: user.id,
        logDate,
        foodId: rice.id,
        foodName: rice.name,
        ...macros(rice, 150),
        source: "manual",
        mealType: "dinner",
      },
      {
        userId: user.id,
        logDate,
        foodId: rajma.id,
        foodName: rajma.name,
        ...macros(rajma, 150),
        source: "manual",
        mealType: "dinner",
      },
    ],
  });

  console.log("5. log water + weight");
  await prisma.waterLog.createMany({
    data: [
      { userId: user.id, logDate, amountMl: 250 },
      { userId: user.id, logDate, amountMl: 500 },
    ],
  });
  await prisma.weightLog.create({
    data: {
      userId: user.id,
      logDate,
      weightKg: new Prisma.Decimal(91.8),
      waistCm: new Prisma.Decimal(102),
    },
  });

  console.log("6. refresh + query daily_totals materialized view");
  await prisma.$executeRawUnsafe("REFRESH MATERIALIZED VIEW daily_totals");
  const totals = await prisma.$queryRaw<
    Array<{ user_id: string; calories: number; protein_g: number; items_logged: number }>
  >`SELECT user_id::text, calories::float, protein_g::float, items_logged::int FROM daily_totals WHERE user_id = ${user.id}::uuid`;
  console.log("   ", totals);
  if (totals.length !== 1) throw new Error("daily_totals missing row");
  if (totals[0].items_logged !== 3) throw new Error("items_logged != 3");

  console.log("7. create workout_log");
  const day1 = await prisma.workout.findFirstOrThrow({ where: { dayNumber: 1 } });
  const started = new Date();
  const completed = new Date(started.getTime() + 45 * 60 * 1000);
  const wLog = await prisma.workoutLog.create({
    data: {
      userId: user.id,
      workoutId: day1.id,
      startedAt: started,
      completedAt: completed,
      logDate,
      exercisesCompletedJson: [
        { slug: "push-up-incline", sets: [{ reps: 12 }, { reps: 11 }, { reps: 10 }, { reps: 9 }] },
        { slug: "db-bench-press", sets: [{ reps: 10, weight_kg: 10 }, { reps: 10, weight_kg: 10 }, { reps: 8, weight_kg: 10 }] },
      ],
      durationMin: 45,
      rpeOverall: 7,
    },
  });
  console.log("   workout_log.id =", wLog.id);

  console.log("8. cleanup");
  await prisma.user.delete({ where: { id: user.id } });

  console.log("\n✅ Phase 1 integration test passed.");
}

main()
  .catch((err) => {
    console.error("\n❌", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
