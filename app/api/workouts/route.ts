import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDateUTC, getLocalIsoDayOfWeek } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const today = getLocalIsoDayOfWeek(user.timezone);
  const logDate = getLocalDateUTC(user.timezone);

  const [workouts, completedToday] = await Promise.all([
    prisma.workout.findMany({ orderBy: { dayNumber: "asc" } }),
    prisma.workoutLog.findMany({
      where: { userId: user.id, logDate, completedAt: { not: null } },
      select: { workoutId: true },
    }),
  ]);

  const doneIds = new Set(completedToday.map((r) => r.workoutId).filter((v): v is number => v != null));

  return NextResponse.json({
    today,
    workouts: workouts.map((w) => ({
      id: w.id,
      dayNumber: w.dayNumber,
      name: w.name,
      category: w.category,
      durationMin: w.durationMin,
      description: w.description,
      exerciseCount: Array.isArray(w.exercisesJson)
        ? (w.exercisesJson as unknown[]).length
        : 0,
      completedToday: doneIds.has(w.id),
    })),
  });
}
