import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  getLocalDate,
  getLocalDateUTC,
  getLocalHour,
  getLocalIsoDayOfWeek,
  getLocalMinute,
} from "@/lib/time";
import { resolveNextMeal, MEAL_TIMES } from "@/lib/meals/next-meal";
import { computeStreak } from "@/lib/streak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const tz = user.timezone;
  const todayStr = getLocalDate(tz, now);
  const todayDate = getLocalDateUTC(tz, now);
  const dayOfWeek = getLocalIsoDayOfWeek(tz, now);
  const currentHour = getLocalHour(tz, now);
  const currentMinute = getLocalMinute(tz, now);

  // Last 14 days of weight logs for a sparkline.
  const weightFrom = new Date(todayDate);
  weightFrom.setUTCDate(weightFrom.getUTCDate() - 90);

  const [
    foodAgg,
    loggedToday,
    waterAgg,
    recentWeights,
    lastWeight,
    todayWorkout,
    meals,
    completedWorkoutToday,
  ] = await Promise.all([
    prisma.foodLog.aggregate({
      where: { userId: user.id, logDate: todayDate },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
      _count: { _all: true },
    }),
    prisma.foodLog.findMany({
      where: { userId: user.id, logDate: todayDate },
      select: { mealType: true },
    }),
    prisma.waterLog.aggregate({
      where: { userId: user.id, logDate: todayDate },
      _sum: { amountMl: true },
    }),
    prisma.weightLog.findMany({
      where: { userId: user.id, logDate: { gte: weightFrom } },
      orderBy: { logDate: "asc" },
      select: { logDate: true, weightKg: true },
    }),
    prisma.weightLog.findFirst({
      where: { userId: user.id },
      orderBy: { logDate: "desc" },
    }),
    prisma.workout.findFirst({ where: { dayNumber: dayOfWeek } }),
    prisma.meal.findMany({ where: { dayOfWeek }, orderBy: { id: "asc" } }),
    prisma.workoutLog.findFirst({
      where: { userId: user.id, logDate: todayDate },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const streak = await computeStreak(user.id, todayStr);

  const loggedMealTypes = new Set(
    loggedToday
      .map((l) => l.mealType)
      .filter((t): t is string => typeof t === "string"),
  );

  const next = resolveNextMeal({
    meals,
    currentHour,
    currentMinute,
    dietPreference: user.dietPreference as "veg" | "non-veg" | "mixed",
    loggedMealTypes,
  });

  // 7-day moving average helpers for weight.
  const weightsByDay = recentWeights.map((w) => ({
    date: (typeof w.logDate === "string" ? w.logDate : w.logDate.toISOString().slice(0, 10)) as string,
    kg: Number(w.weightKg),
  }));
  const latestKg = lastWeight ? Number(lastWeight.weightKg) : Number(user.currentWeightKg);
  const sevenDay = weightsByDay.slice(-7);
  const sevenDayAvg =
    sevenDay.length > 0 ? sevenDay.reduce((a, b) => a + b.kg, 0) / sevenDay.length : null;

  const response = {
    date: todayStr,
    timezone: tz,
    dayOfWeek,
    user: { name: user.name, birthDate: user.birthDate.toISOString().slice(0, 10) },
    targets: {
      calories: user.dailyCalorieTarget,
      proteinG: user.dailyProteinTargetG,
      carbsG: user.dailyCarbsTargetG,
      fatG: user.dailyFatTargetG,
      waterMl: user.dailyWaterTargetMl,
    },
    consumed: {
      calories: toNum(foodAgg._sum.calories),
      proteinG: toNum(foodAgg._sum.proteinG),
      carbsG: toNum(foodAgg._sum.carbsG),
      fatG: toNum(foodAgg._sum.fatG),
      fiberG: toNum(foodAgg._sum.fiberG),
      itemsLogged: foodAgg._count._all,
    },
    water: { consumedMl: waterAgg._sum.amountMl ?? 0 },
    streakDays: streak,
    nextMeal: next
      ? {
          id: next.meal.id,
          label: next.label,
          mealType: next.meal.mealType,
          name: next.meal.name,
          description: next.meal.description,
          targetCalories: next.meal.targetCalories,
          targetProteinG: next.meal.targetProteinG,
          minutesUntil: next.minutesUntil,
          isUpcoming: next.isUpcoming,
          window: MEAL_TIMES[next.meal.mealType] ?? null,
        }
      : null,
    todayWorkout: todayWorkout
      ? {
          id: todayWorkout.id,
          dayNumber: todayWorkout.dayNumber,
          name: todayWorkout.name,
          category: todayWorkout.category,
          durationMin: todayWorkout.durationMin,
          description: todayWorkout.description,
          exerciseCount: Array.isArray(todayWorkout.exercisesJson)
            ? (todayWorkout.exercisesJson as unknown[]).length
            : 0,
          completedToday: !!completedWorkoutToday?.completedAt,
          inProgress: !!completedWorkoutToday && !completedWorkoutToday.completedAt,
        }
      : null,
    weight: {
      currentKg: latestKg,
      targetKg: Number(user.targetWeightKg),
      startKg: Number(user.currentWeightKg),
      sevenDayAvgKg: sevenDayAvg,
      lastLoggedDate: lastWeight
        ? typeof lastWeight.logDate === "string"
          ? lastWeight.logDate
          : lastWeight.logDate.toISOString().slice(0, 10)
        : null,
      sparkline: weightsByDay,
    },
  };

  return NextResponse.json(response);
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}
