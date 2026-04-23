import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toJSON(user: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    heightCm: Number(user.heightCm),
    currentWeightKg: Number(user.currentWeightKg),
    targetWeightKg: Number(user.targetWeightKg),
    birthDate: user.birthDate.toISOString().slice(0, 10),
    dietPreference: user.dietPreference,
    dailyCalorieTarget: user.dailyCalorieTarget,
    dailyProteinTargetG: user.dailyProteinTargetG,
    dailyCarbsTargetG: user.dailyCarbsTargetG,
    dailyFatTargetG: user.dailyFatTargetG,
    dailyWaterTargetMl: user.dailyWaterTargetMl,
    timezone: user.timezone,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toJSON(user));
}

const updateSchema = z
  .object({
    name: z.string().min(1).max(80),
    currentWeightKg: z.number().min(30).max(300),
    targetWeightKg: z.number().min(30).max(300),
    heightCm: z.number().min(100).max(250),
    dietPreference: z.enum(["veg", "non-veg", "mixed"]),
    dailyCalorieTarget: z.number().int().min(1000).max(5000),
    dailyProteinTargetG: z.number().int().min(40).max(400),
    dailyCarbsTargetG: z.number().int().min(20).max(600),
    dailyFatTargetG: z.number().int().min(20).max(200),
    dailyWaterTargetMl: z.number().int().min(1000).max(8000),
    timezone: z.string().min(1).max(50),
  })
  .partial();

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      ...parsed.data,
      // Decimals must be strings/Prisma.Decimal — Prisma accepts JS numbers too in v5.
    },
  });
  return NextResponse.json(toJSON(user));
}
