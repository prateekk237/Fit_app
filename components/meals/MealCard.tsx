"use client";

import {
  ArrowRight,
  Check,
  Coffee,
  Cookie,
  Dumbbell,
  Flame,
  Moon,
  Sun,
  Utensils,
  Apple,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEAL_TYPE_LABEL, type MealType } from "@/types/food-log";

export interface PlanMeal {
  id: number;
  mealType: string;
  isVegOption: boolean;
  name: string;
  description: string | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  foods: Array<{
    foodId: number | null;
    name: string;
    isVeg: boolean;
    grams: number;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    missing: boolean;
  }>;
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
}

const ICON: Record<string, LucideIcon> = {
  "pre-workout": Dumbbell,
  breakfast: Coffee,
  "mid-morning": Apple,
  lunch: Sun,
  snack: Cookie,
  "post-workout": Dumbbell,
  dinner: Moon,
};

interface Props {
  meal: PlanMeal;
  onLog: () => void;
  logging: boolean;
  logged: boolean;
}

export function MealCard({ meal, onLog, logging, logged }: Props) {
  const Icon = ICON[meal.mealType] ?? Utensils;
  const hasMissing = meal.foods.some((f) => f.missing);

  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {MEAL_TYPE_LABEL[meal.mealType as MealType] ?? meal.mealType}
            </p>
            <h3 className="text-base font-semibold capitalize leading-snug">
              {meal.name}
            </h3>
            {meal.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {meal.description}
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
            meal.isVegOption
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700",
          )}
        >
          {meal.isVegOption ? "Veg" : "Non-veg"}
        </span>
      </div>

      <ul className="mt-3 divide-y rounded-md border bg-muted/30">
        {meal.foods.map((f, i) => (
          <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm capitalize">{f.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {f.grams}g
                {!f.missing && (
                  <>
                    <span className="mx-1">·</span>
                    <span>{Math.round(f.calories)} kcal</span>
                  </>
                )}
              </p>
            </div>
            {f.missing && (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-700">
                unmatched
              </span>
            )}
          </li>
        ))}
      </ul>

      {hasMissing && (
        <p className="mt-2 text-[0.7rem] text-amber-600">
          Some ingredients aren&apos;t in the seed database — their macros
          won&apos;t be counted. You can still log what matched.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">
              {meal.totals.calories}
            </span>{" "}
            kcal
          </span>
          <span className="mx-1">·</span>
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">
              {Math.round(meal.totals.proteinG)}
            </span>
            g P
          </span>
          {meal.targetCalories != null && (
            <span className="ml-1 text-muted-foreground/60">
              (target {meal.targetCalories})
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={onLog}
          disabled={logging || logged}
          className={cn(
            logged && "bg-emerald-600 hover:bg-emerald-600",
          )}
        >
          {logged ? (
            <>
              <Check className="mr-1 h-4 w-4" /> Logged
            </>
          ) : logging ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Logging…
            </>
          ) : (
            <>
              Log this <ArrowRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
