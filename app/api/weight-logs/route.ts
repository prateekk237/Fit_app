import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDateUTC } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  weightKg: z.number().min(30).max(400),
  waistCm: z.number().positive().max(300).optional(),
  chestCm: z.number().positive().max(300).optional(),
  hipCm: z.number().positive().max(300).optional(),
  bodyFatPct: z.number().min(1).max(70).optional(),
  notes: z.string().max(500).optional(),
  photoUrl: z.string().max(500).optional(),
  facePhotoUrl: z.string().max(500).optional(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type LogRow = Awaited<ReturnType<typeof prisma.weightLog.findFirstOrThrow>>;

function serialize(row: LogRow) {
  return {
    id: row.id.toString(),
    loggedAt: row.loggedAt,
    logDate: typeof row.logDate === "string"
      ? row.logDate
      : row.logDate.toISOString().slice(0, 10),
    weightKg: Number(row.weightKg),
    waistCm: row.waistCm != null ? Number(row.waistCm) : null,
    chestCm: row.chestCm != null ? Number(row.chestCm) : null,
    hipCm: row.hipCm != null ? Number(row.hipCm) : null,
    bodyFatPct: row.bodyFatPct != null ? Number(row.bodyFatPct) : null,
    notes: row.notes,
    photoUrl: row.photoUrl,
    facePhotoUrl: row.facePhotoUrl,
  };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const where: Prisma.WeightLogWhereInput = { userId: user.id };
  if (fromStr || toStr) {
    where.logDate = {
      ...(fromStr ? { gte: new Date(`${fromStr}T00:00:00Z`) } : {}),
      ...(toStr ? { lte: new Date(`${toStr}T00:00:00Z`) } : {}),
    };
  }

  const logs = await prisma.weightLog.findMany({
    where,
    orderBy: { logDate: "asc" },
    take: 500,
  });

  return NextResponse.json({
    targetKg: Number(user.targetWeightKg),
    startKg: Number(user.currentWeightKg),
    logs: logs.map(serialize),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
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
  const logDate = input.logDate
    ? new Date(`${input.logDate}T00:00:00Z`)
    : getLocalDateUTC(user.timezone);

  // One entry per local day (uniq_weight_day). Upsert so users can edit today's.
  const row = await prisma.weightLog.upsert({
    where: { userId_logDate: { userId: user.id, logDate } },
    create: {
      userId: user.id,
      logDate,
      weightKg: new Prisma.Decimal(input.weightKg),
      waistCm: input.waistCm != null ? new Prisma.Decimal(input.waistCm) : null,
      chestCm: input.chestCm != null ? new Prisma.Decimal(input.chestCm) : null,
      hipCm: input.hipCm != null ? new Prisma.Decimal(input.hipCm) : null,
      bodyFatPct: input.bodyFatPct != null ? new Prisma.Decimal(input.bodyFatPct) : null,
      notes: input.notes ?? null,
      photoUrl: input.photoUrl ?? null,
      facePhotoUrl: input.facePhotoUrl ?? null,
    },
    update: {
      weightKg: new Prisma.Decimal(input.weightKg),
      waistCm: input.waistCm != null ? new Prisma.Decimal(input.waistCm) : null,
      chestCm: input.chestCm != null ? new Prisma.Decimal(input.chestCm) : null,
      hipCm: input.hipCm != null ? new Prisma.Decimal(input.hipCm) : null,
      bodyFatPct: input.bodyFatPct != null ? new Prisma.Decimal(input.bodyFatPct) : null,
      notes: input.notes ?? null,
      photoUrl: input.photoUrl ?? null,
      facePhotoUrl: input.facePhotoUrl ?? null,
    },
  });

  // Keep user's currentWeightKg in sync so other views reflect the latest.
  await prisma.user.update({
    where: { id: user.id },
    data: { currentWeightKg: new Prisma.Decimal(input.weightKg) },
  });

  return NextResponse.json(serialize(row), { status: 201 });
}
