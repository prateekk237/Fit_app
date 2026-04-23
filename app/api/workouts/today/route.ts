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
  const dayOfWeek = getLocalIsoDayOfWeek(user.timezone);
  const logDate = getLocalDateUTC(user.timezone);

  const [workout, latestLog] = await Promise.all([
    prisma.workout.findFirst({ where: { dayNumber: dayOfWeek } }),
    prisma.workoutLog.findFirst({
      where: { userId: user.id, logDate },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  if (!workout) {
    return NextResponse.json({ dayOfWeek, workout: null, log: null });
  }

  return NextResponse.json({
    dayOfWeek,
    workout: {
      id: workout.id,
      dayNumber: workout.dayNumber,
      name: workout.name,
      category: workout.category,
      durationMin: workout.durationMin,
      description: workout.description,
      exercises: workout.exercisesJson,
    },
    log: latestLog
      ? {
          id: latestLog.id,
          startedAt: latestLog.startedAt,
          completedAt: latestLog.completedAt,
          rpeOverall: latestLog.rpeOverall,
          durationMin: latestLog.durationMin,
        }
      : null,
  });
}
