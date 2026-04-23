/**
 * Compute the user's next upcoming meal for today, honoring:
 *  - their timezone (for current hour)
 *  - their diet preference (hide non-veg options for veg users)
 *  - which meals they've already logged today
 *
 * Meal-type windows (IST-standard for an Indian desk worker on the plan):
 *   pre-workout   06:30 – 07:15
 *   breakfast     07:15 – 10:00
 *   mid-morning   10:00 – 12:30
 *   lunch         12:30 – 15:00
 *   snack         15:00 – 17:00
 *   post-workout  17:00 – 19:00
 *   dinner        19:00 – 22:00
 */

import type { Meal } from "@prisma/client";

export const MEAL_TIMES: Record<string, { start: number; end: number; label: string }> = {
  "pre-workout":  { start: 6.5,  end: 7.25,  label: "Pre-workout" },
  breakfast:      { start: 7.25, end: 10,    label: "Breakfast" },
  "mid-morning":  { start: 10,   end: 12.5,  label: "Mid-morning" },
  lunch:          { start: 12.5, end: 15,    label: "Lunch" },
  snack:          { start: 15,   end: 17,    label: "Snack" },
  "post-workout": { start: 17,   end: 19,    label: "Post-workout" },
  dinner:         { start: 19,   end: 22,    label: "Dinner" },
};

// Ordered meal progression for the day.
const MEAL_ORDER = [
  "pre-workout",
  "breakfast",
  "mid-morning",
  "lunch",
  "snack",
  "post-workout",
  "dinner",
] as const;

export interface NextMealArgs {
  meals: Meal[];                  // meals for today's day_of_week
  currentHour: number;            // 0–23, in user tz
  currentMinute: number;          // 0–59
  dietPreference: "veg" | "non-veg" | "mixed";
  loggedMealTypes: Set<string>;   // meal_types already logged today
}

export interface NextMealResult {
  meal: Meal;
  label: string;
  minutesUntil: number;           // >0 if upcoming, 0 if in-window, <0 if already passed
  isUpcoming: boolean;
}

export function resolveNextMeal(args: NextMealArgs): NextMealResult | null {
  const { meals, currentHour, currentMinute, dietPreference, loggedMealTypes } = args;
  const nowFloat = currentHour + currentMinute / 60;

  // Find the next meal-type bucket whose end is still ahead OR whose start is
  // coming up, and which the user hasn't already logged.
  for (const mealType of MEAL_ORDER) {
    const win = MEAL_TIMES[mealType];
    if (!win) continue;
    if (loggedMealTypes.has(mealType)) continue;
    if (nowFloat > win.end) continue; // bucket has passed

    const candidates = meals
      .filter((m) => m.mealType === mealType)
      .filter((m) => pickByDiet(m.isVegOption, dietPreference));

    if (candidates.length === 0) continue;

    const meal = candidates[0]!;
    const minutesUntil = Math.max(0, Math.round((win.start - nowFloat) * 60));
    return {
      meal,
      label: win.label,
      minutesUntil,
      isUpcoming: nowFloat < win.start,
    };
  }

  return null;
}

function pickByDiet(
  isVegOption: boolean,
  pref: "veg" | "non-veg" | "mixed",
): boolean {
  if (pref === "veg") return isVegOption === true;
  if (pref === "non-veg") return isVegOption === false;
  return true; // mixed — either is fine; caller's sort order decides.
}
