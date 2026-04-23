import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDateUTC } from "@/lib/time";
import { inferMealType, isValidMealType, scaleMacros } from "@/lib/food-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();
const bodySchema = z
  .object({ mealType: z.string().optional() })
  .optional();

interface FoodsJsonItem {
  food: string;
  grams: number;
}

/**
 * POST /api/meals/:id/log
 *   Batch-inserts food_logs for every constituent food in the meal plan row,
 *   in a single DB transaction. Scales macros from the seeded foods table.
 *   Any item whose food name isn't in the foods table is skipped (logged as
 *   "unresolved").
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idParse = idSchema.safeParse(params.id);
  if (!idParse.success) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  let body: unknown = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    body = {};
  }
  const bodyParsed = bodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const meal = await prisma.meal.findUnique({ where: { id: idParse.data } });
  if (!meal) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const logDate = getLocalDateUTC(user.timezone);

  const requestedMealType = bodyParsed.data?.mealType;
  const mealType =
    requestedMealType && isValidMealType(requestedMealType)
      ? requestedMealType
      : isValidMealType(meal.mealType)
      ? meal.mealType
      : inferMealType(user.timezone);

  const items = Array.isArray(meal.foodsJson)
    ? (meal.foodsJson as unknown as FoodsJsonItem[])
    : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Meal has no foods" }, { status: 422 });
  }

  // Pre-resolve foods so the transaction is short and stays under any lock timeout.
  const foodRows = await prisma.food.findMany({
    where: { name: { in: items.map((i) => i.food.toLowerCase()) } },
  });
  const byName = new Map(foodRows.map((f) => [f.name.toLowerCase(), f]));

  const unresolved: string[] = [];
  const logsData: Prisma.FoodLogCreateManyInput[] = [];
  for (const item of items) {
    const food = byName.get(item.food.toLowerCase());
    if (!food) {
      unresolved.push(item.food);
      continue;
    }
    const macros = scaleMacros(food, item.grams);
    logsData.push({
      userId: user.id,
      logDate,
      foodId: food.id,
      foodName: food.name,
      portionG: macros.portionG,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      fiberG: macros.fiberG,
      source: "meal_plan",
      mealType,
    });
  }

  if (logsData.length === 0) {
    return NextResponse.json(
      { error: "No resolvable foods in meal", unresolved },
      { status: 422 },
    );
  }

  // One transaction: all rows succeed together or none do.
  const inserted = await prisma.$transaction(
    logsData.map((d) => prisma.foodLog.create({ data: d })),
  );

  return NextResponse.json(
    {
      mealId: meal.id,
      mealName: meal.name,
      mealType,
      logIds: inserted.map((l) => l.id),
      unresolved,
    },
    { status: 201 },
  );
}
