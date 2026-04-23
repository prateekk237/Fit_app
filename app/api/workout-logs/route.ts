import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDateUTC } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setSchema = z.object({
  reps: z.number().int().min(0).max(1000).optional(),
  weightKg: z.number().min(0).max(500).optional(),
  completed: z.boolean().optional(),
});

const exerciseSchema = z.object({
  slug: z.string().min(1).max(80),
  sets: z.array(setSchema).max(40),
  skipped: z.boolean().optional(),
});

const createSchema = z.object({
  workoutId: z.number().int().positive().nullable().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMin: z.number().int().nonnegative().max(600).optional(),
  rpeOverall: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  exercises: z.array(exerciseSchema).max(40),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const startedAt = new Date(input.startedAt);
  const completedAt = input.completedAt ? new Date(input.completedAt) : null;
  const logDate = getLocalDateUTC(user.timezone, completedAt ?? startedAt);

  const created = await prisma.workoutLog.create({
    data: {
      userId: user.id,
      workoutId: input.workoutId ?? null,
      startedAt,
      completedAt,
      logDate,
      exercisesCompletedJson: input.exercises as unknown as object,
      durationMin: input.durationMin ?? null,
      rpeOverall: input.rpeOverall ?? null,
      notes: input.notes ?? null,
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      startedAt: created.startedAt,
      completedAt: created.completedAt,
      logDate:
        typeof created.logDate === "string"
          ? created.logDate
          : created.logDate.toISOString().slice(0, 10),
      durationMin: created.durationMin,
      rpeOverall: created.rpeOverall,
    },
    { status: 201 },
  );
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const logs = await prisma.workoutLog.findMany({
    where: {
      userId: user.id,
      ...(from ? { logDate: { gte: new Date(`${from}T00:00:00Z`) } } : {}),
      ...(to ? { logDate: { lte: new Date(`${to}T00:00:00Z`) } } : {}),
    },
    orderBy: [{ startedAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      workoutId: l.workoutId,
      startedAt: l.startedAt,
      completedAt: l.completedAt,
      logDate: typeof l.logDate === "string" ? l.logDate : l.logDate.toISOString().slice(0, 10),
      durationMin: l.durationMin,
      rpeOverall: l.rpeOverall,
      exercises: l.exercisesCompletedJson,
    })),
  });
}
