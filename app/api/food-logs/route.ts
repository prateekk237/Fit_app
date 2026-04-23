import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDate, getLocalDateUTC } from "@/lib/time";
import { inferMealType, isValidMealType, scaleMacros } from "@/lib/food-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    foodId: z.number().int().positive().optional(),
    foodName: z.string().trim().min(1).max(120).optional(),
    portionG: z.number().positive().max(3000),
    mealType: z.string().optional(),
    loggedAt: z.string().datetime().optional(),
    // Free-form entry: allow user-supplied macros when foodId is not set.
    calories: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatG: z.number().nonnegative().optional(),
    fiberG: z.number().nonnegative().optional(),
  })
  .refine(
    (v) => v.foodId != null || (v.foodName != null && v.calories != null),
    "foodId or (foodName + calories) is required",
  );

function serialize(log: Awaited<ReturnType<typeof prisma.foodLog.create>>) {
  return {
    id: log.id,
    loggedAt: log.loggedAt,
    logDate: typeof log.logDate === "string"
      ? log.logDate
      : log.logDate.toISOString().slice(0, 10),
    foodId: log.foodId,
    foodName: log.foodName,
    portionG: Number(log.portionG),
    calories: Number(log.calories),
    proteinG: Number(log.proteinG),
    carbsG: Number(log.carbsG),
    fatG: Number(log.fatG),
    fiberG: log.fiberG != null ? Number(log.fiberG) : null,
    source: log.source,
    mealType: log.mealType,
  };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const logDate = dateParam
    ? new Date(`${dateParam}T00:00:00Z`)
    : getLocalDateUTC(user.timezone);

  const logs = await prisma.foodLog.findMany({
    where: { userId: user.id, logDate },
    orderBy: [{ loggedAt: "asc" }],
  });

  return NextResponse.json({
    date:
      typeof logDate === "string"
        ? logDate
        : logDate.toISOString().slice(0, 10),
    logs: logs.map(serialize),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

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

  const loggedAt = input.loggedAt ? new Date(input.loggedAt) : new Date();
  const logDate = getLocalDateUTC(user.timezone, loggedAt);
  const mealType =
    input.mealType && isValidMealType(input.mealType)
      ? input.mealType
      : inferMealType(user.timezone, loggedAt);

  let data;
  if (input.foodId) {
    const food = await prisma.food.findUnique({ where: { id: input.foodId } });
    if (!food) return NextResponse.json({ error: "Food not found" }, { status: 404 });
    data = {
      userId: user.id,
      loggedAt,
      logDate,
      foodId: food.id,
      foodName: input.foodName ?? food.name,
      ...scaleMacros(food, input.portionG),
      source: "manual",
      mealType,
    };
  } else {
    data = {
      userId: user.id,
      loggedAt,
      logDate,
      foodId: null,
      foodName: input.foodName!,
      portionG: input.portionG,
      calories: input.calories!,
      proteinG: input.proteinG ?? 0,
      carbsG: input.carbsG ?? 0,
      fatG: input.fatG ?? 0,
      fiberG: input.fiberG ?? null,
      source: "manual",
      mealType,
    };
  }

  const created = await prisma.foodLog.create({ data });
  return NextResponse.json(serialize(created), { status: 201 });
}
