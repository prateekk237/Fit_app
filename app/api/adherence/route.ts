import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDate, getLocalDateUTC } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
});

/**
 * GET /api/adherence?days=14
 *   Returns a day-by-day aggregate of food_logs totals + workout flag +
 *   water total for the last N days (default 14) in the user's timezone.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad query" }, { status: 400 });
  const { days } = parsed.data;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const today = getLocalDateUTC(user.timezone);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  // Pull food + water + workouts in parallel.
  const [foodAgg, waterAgg, workouts] = await Promise.all([
    prisma.foodLog.groupBy({
      by: ["logDate"],
      where: { userId: user.id, logDate: { gte: from, lte: today } },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
    prisma.waterLog.groupBy({
      by: ["logDate"],
      where: { userId: user.id, logDate: { gte: from, lte: today } },
      _sum: { amountMl: true },
    }),
    prisma.workoutLog.findMany({
      where: {
        userId: user.id,
        logDate: { gte: from, lte: today },
        completedAt: { not: null },
      },
      select: { logDate: true, rpeOverall: true, durationMin: true },
    }),
  ]);

  const foodByDate = new Map(
    foodAgg.map((r) => [
      typeof r.logDate === "string" ? r.logDate : r.logDate.toISOString().slice(0, 10),
      r,
    ]),
  );
  const waterByDate = new Map(
    waterAgg.map((r) => [
      typeof r.logDate === "string" ? r.logDate : r.logDate.toISOString().slice(0, 10),
      r,
    ]),
  );
  const workoutByDate = new Map<string, { rpe: number | null; mins: number | null }>();
  for (const w of workouts) {
    const key =
      typeof w.logDate === "string" ? w.logDate : w.logDate.toISOString().slice(0, 10);
    workoutByDate.set(key, { rpe: w.rpeOverall, mins: w.durationMin });
  }

  const rows: Array<{
    date: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    waterMl: number;
    workoutDone: boolean;
    workoutDurationMin: number | null;
    workoutRpe: number | null;
    proteinAdherence: number;
    calorieAdherence: number;
  }> = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const f = foodByDate.get(key);
    const w = waterByDate.get(key);
    const wk = workoutByDate.get(key);

    const calories = f?._sum.calories ? Number(f._sum.calories) : 0;
    const proteinG = f?._sum.proteinG ? Number(f._sum.proteinG) : 0;
    const carbsG = f?._sum.carbsG ? Number(f._sum.carbsG) : 0;
    const fatG = f?._sum.fatG ? Number(f._sum.fatG) : 0;
    const waterMl = w?._sum.amountMl ?? 0;

    rows.push({
      date: key,
      calories: Math.round(calories),
      proteinG: round1(proteinG),
      carbsG: round1(carbsG),
      fatG: round1(fatG),
      waterMl,
      workoutDone: !!wk,
      workoutDurationMin: wk?.mins ?? null,
      workoutRpe: wk?.rpe ?? null,
      proteinAdherence:
        user.dailyProteinTargetG > 0
          ? Math.round((proteinG / user.dailyProteinTargetG) * 100)
          : 0,
      calorieAdherence:
        user.dailyCalorieTarget > 0
          ? Math.round((calories / user.dailyCalorieTarget) * 100)
          : 0,
    });
  }

  return NextResponse.json({
    days,
    range: { from: rows[0]?.date ?? null, to: rows[rows.length - 1]?.date ?? null },
    targets: {
      calories: user.dailyCalorieTarget,
      proteinG: user.dailyProteinTargetG,
      carbsG: user.dailyCarbsTargetG,
      fatG: user.dailyFatTargetG,
      waterMl: user.dailyWaterTargetMl,
    },
    today: getLocalDate(user.timezone),
    rows,
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
