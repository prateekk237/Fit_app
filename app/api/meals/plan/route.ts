import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalIsoDayOfWeek } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  day: z.coerce.number().int().min(1).max(7).optional(),
  veg: z.enum(["true", "false"]).optional(),
});

interface FoodsJsonItem {
  food: string;
  grams: number;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad query params" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const todayIso = getLocalIsoDayOfWeek(user.timezone);
  const day = parsed.data.day ?? todayIso;

  // Diet filter: explicit ?veg=true/false wins, otherwise derive from profile.
  let vegFilter: boolean | undefined;
  if (parsed.data.veg === "true") vegFilter = true;
  else if (parsed.data.veg === "false") vegFilter = false;
  else if (user.dietPreference === "veg") vegFilter = true;
  else if (user.dietPreference === "non-veg") vegFilter = false;
  // mixed = show both

  const meals = await prisma.meal.findMany({
    where: {
      dayOfWeek: day,
      ...(vegFilter !== undefined ? { isVegOption: vegFilter } : {}),
    },
    orderBy: [{ id: "asc" }],
  });

  // Resolve every food name referenced across all meals in one query.
  const foodNames = new Set<string>();
  for (const m of meals) {
    const items = Array.isArray(m.foodsJson)
      ? (m.foodsJson as unknown as FoodsJsonItem[])
      : [];
    for (const it of items) if (it?.food) foodNames.add(it.food.toLowerCase());
  }
  const foods = await prisma.food.findMany({
    where: { name: { in: Array.from(foodNames) } },
  });
  const foodByName = new Map(foods.map((f) => [f.name.toLowerCase(), f]));

  const enriched = meals.map((m) => {
    const items = Array.isArray(m.foodsJson)
      ? (m.foodsJson as unknown as FoodsJsonItem[])
      : [];
    const resolved = items.map((it) => {
      const food = foodByName.get(it.food.toLowerCase());
      if (!food) {
        return {
          foodId: null,
          name: it.food,
          isVeg: true,
          grams: it.grams,
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          fiberG: null as number | null,
          missing: true,
        };
      }
      const factor = it.grams / 100;
      return {
        foodId: food.id,
        name: food.name,
        isVeg: food.isVeg,
        grams: it.grams,
        calories: round2(Number(food.caloriesPer100g) * factor),
        proteinG: round2(Number(food.proteinG) * factor),
        carbsG: round2(Number(food.carbsG) * factor),
        fatG: round2(Number(food.fatG) * factor),
        fiberG: food.fiberG != null ? round2(Number(food.fiberG) * factor) : null,
        missing: false,
      };
    });

    const totals = resolved.reduce(
      (acc, r) => ({
        calories: acc.calories + r.calories,
        proteinG: acc.proteinG + r.proteinG,
        carbsG: acc.carbsG + r.carbsG,
        fatG: acc.fatG + r.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    return {
      id: m.id,
      mealType: m.mealType,
      isVegOption: m.isVegOption,
      name: m.name,
      description: m.description,
      targetCalories: m.targetCalories,
      targetProteinG: m.targetProteinG,
      foods: resolved,
      totals: {
        calories: Math.round(totals.calories),
        proteinG: round1(totals.proteinG),
        carbsG: round1(totals.carbsG),
        fatG: round1(totals.fatG),
      },
    };
  });

  return NextResponse.json({
    dayOfWeek: day,
    isToday: day === todayIso,
    dietPreference: user.dietPreference,
    vegFilter,
    meals: enriched,
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
