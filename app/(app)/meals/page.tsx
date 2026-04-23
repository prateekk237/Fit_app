"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DayPicker } from "@/components/meals/DayPicker";
import { DietToggle, type VegMode } from "@/components/meals/DietToggle";
import { MealCard, type PlanMeal } from "@/components/meals/MealCard";
import { MEAL_TYPE_LABEL, type MealType } from "@/types/food-log";

interface PlanResponse {
  dayOfWeek: number;
  isToday: boolean;
  dietPreference: "veg" | "non-veg" | "mixed";
  vegFilter: boolean | null;
  meals: PlanMeal[];
}

const MEAL_ORDER: string[] = [
  "pre-workout",
  "breakfast",
  "mid-morning",
  "lunch",
  "snack",
  "post-workout",
  "dinner",
];

function modeToQuery(m: VegMode): string | null {
  if (m === "veg") return "true";
  if (m === "non-veg") return "false";
  return null;
}

function isoDayOfWeekLocal(): number {
  // Match the server's Intl-based ISO day-of-week so "today" highlights correctly.
  const day = new Date().getDay(); // 0=Sun…6=Sat
  return day === 0 ? 7 : day;
}

async function fetchPlan(day: number, veg: string | null): Promise<PlanResponse> {
  const params = new URLSearchParams();
  params.set("day", String(day));
  if (veg) params.set("veg", veg);
  const res = await fetch(`/api/meals/plan?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load plan");
  return res.json();
}

async function logMeal(id: number): Promise<{ logIds: string[]; unresolved: string[] }> {
  const res = await fetch(`/api/meals/${id}/log`, { method: "POST" });
  if (!res.ok) throw new Error((await res.json()).error ?? "Log failed");
  return res.json();
}

export default function MealsPage() {
  const today = isoDayOfWeekLocal();
  const [day, setDay] = useState<number>(today);
  const [veg, setVeg] = useState<VegMode>("all");
  const [loggedMealIds, setLoggedMealIds] = useState<Set<number>>(new Set());
  const qc = useQueryClient();

  const {
    data,
    isPending,
    error,
  } = useQuery({
    queryKey: ["meals-plan", day, veg],
    queryFn: () => fetchPlan(day, modeToQuery(veg)),
  });

  const logMutation = useMutation({
    mutationFn: logMeal,
    onSuccess: (_res, mealId) => {
      setLoggedMealIds((s) => new Set(s).add(mealId));
      qc.invalidateQueries({ queryKey: ["food-logs", "today"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    },
  });

  const grouped = groupByMealType(data?.meals ?? []);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meal plan</h1>
          <p className="text-sm text-muted-foreground">
            7-day rotating plan — tap any meal to log it instantly.
          </p>
        </div>
        <DietToggle value={veg} onChange={setVeg} />
      </div>

      <DayPicker value={day} onChange={setDay} today={today} />

      {isPending && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <Card className="p-4 text-sm text-destructive">Failed to load meal plan.</Card>
      )}

      {data && data.meals.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No meals match this filter. Try another day or clear the diet filter.
        </Card>
      )}

      {data && grouped.map(([type, meals]) => (
        <section key={type}>
          <header className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {MEAL_TYPE_LABEL[type as MealType] ?? type}
            </h2>
          </header>
          <div className="space-y-3">
            {meals.map((m) => (
              <MealCard
                key={m.id}
                meal={m}
                onLog={() => logMutation.mutate(m.id)}
                logging={logMutation.isPending && logMutation.variables === m.id}
                logged={loggedMealIds.has(m.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {logMutation.error && (
        <Card className="p-3 text-sm text-destructive">
          {(logMutation.error as Error).message}
        </Card>
      )}
    </div>
  );
}

function groupByMealType(meals: PlanMeal[]): [string, PlanMeal[]][] {
  const map = new Map<string, PlanMeal[]>();
  for (const m of meals) {
    if (!map.has(m.mealType)) map.set(m.mealType, []);
    map.get(m.mealType)!.push(m);
  }
  return Array.from(map.entries()).sort(
    ([a], [b]) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(b),
  );
}
