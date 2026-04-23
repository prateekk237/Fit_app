import { Prisma, type Food } from "@prisma/client";
import { MEAL_TIMES } from "@/lib/meals/next-meal";
import { getLocalHour, getLocalMinute } from "@/lib/time";

export type MealType =
  | "pre-workout"
  | "breakfast"
  | "mid-morning"
  | "lunch"
  | "snack"
  | "post-workout"
  | "dinner";

/** Scale food macros (per 100g) to portion_g. Returns Prisma.Decimal values. */
export function scaleMacros(food: Food, portionG: number) {
  const factor = portionG / 100;
  return {
    portionG: new Prisma.Decimal(portionG),
    calories: new Prisma.Decimal(round2(Number(food.caloriesPer100g) * factor)),
    proteinG: new Prisma.Decimal(round2(Number(food.proteinG) * factor)),
    carbsG: new Prisma.Decimal(round2(Number(food.carbsG) * factor)),
    fatG: new Prisma.Decimal(round2(Number(food.fatG) * factor)),
    fiberG:
      food.fiberG != null
        ? new Prisma.Decimal(round2(Number(food.fiberG) * factor))
        : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pick the likely meal-type for "now" in the user's timezone. */
export function inferMealType(timezone: string, date: Date = new Date()): MealType {
  const h = getLocalHour(timezone, date) + getLocalMinute(timezone, date) / 60;
  if (h < 7.25) return "pre-workout";
  if (h < 10) return "breakfast";
  if (h < 12.5) return "mid-morning";
  if (h < 15) return "lunch";
  if (h < 17) return "snack";
  if (h < 19) return "post-workout";
  return "dinner";
}

export function isValidMealType(v: unknown): v is MealType {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(MEAL_TIMES, v)
  );
}
