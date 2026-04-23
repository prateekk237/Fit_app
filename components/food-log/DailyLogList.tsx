"use client";

import { useMemo, useState } from "react";
import {
  Coffee,
  Sun,
  Cookie,
  Moon,
  UtensilsCrossed,
  Dumbbell,
  Apple,
  Trash2,
  Pencil,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEAL_TYPE_LABEL, type FoodLog, type MealType } from "@/types/food-log";

const MEAL_ICON: Record<string, LucideIcon> = {
  "pre-workout": Dumbbell,
  breakfast: Coffee,
  "mid-morning": Apple,
  lunch: Sun,
  snack: Cookie,
  "post-workout": Dumbbell,
  dinner: Moon,
};

const MEAL_ORDER: MealType[] = [
  "pre-workout",
  "breakfast",
  "mid-morning",
  "lunch",
  "snack",
  "post-workout",
  "dinner",
];

interface Props {
  logs: FoodLog[];
  onUpdatePortion: (log: FoodLog, portionG: number) => void;
  onDelete: (log: FoodLog) => void;
  isMutating?: boolean;
}

export function DailyLogList({ logs, onUpdatePortion, onDelete, isMutating }: Props) {
  const totals = useMemo(() => {
    return logs.reduce(
      (acc, l) => {
        acc.calories += l.calories;
        acc.proteinG += l.proteinG;
        acc.carbsG += l.carbsG;
        acc.fatG += l.fatG;
        acc.fiberG += l.fiberG ?? 0;
        return acc;
      },
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    );
  }, [logs]);

  const grouped = useMemo(() => {
    const map = new Map<string, FoodLog[]>();
    for (const l of logs) {
      const k = (l.mealType as string) ?? "other";
      (map.get(k) ?? map.set(k, []).get(k))!.push(l);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => mealOrder(a) - mealOrder(b),
    );
  }, [logs]);

  if (logs.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <UtensilsCrossed className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold">Nothing logged yet today</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Search a food above or use the photo / meal-plan tabs to start logging.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([mealKey, items]) => {
        const mealSum = items.reduce((a, b) => a + b.calories, 0);
        return (
          <section key={mealKey}>
            <header className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {MEAL_TYPE_LABEL[mealKey as MealType] ?? mealKey}
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(mealSum)} kcal
              </span>
            </header>
            <ul className="divide-y rounded-lg border bg-card">
              {items.map((l) => (
                <LogItem
                  key={l.id}
                  log={l}
                  onUpdatePortion={(g) => onUpdatePortion(l, g)}
                  onDelete={() => onDelete(l)}
                  disabled={isMutating}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <Card className="sticky bottom-20 grid grid-cols-5 gap-2 bg-primary/5 p-3 text-center backdrop-blur md:bottom-6">
        <Stat label="kcal" value={Math.round(totals.calories)} accent="text-primary" />
        <Stat label="Protein" value={`${Math.round(totals.proteinG)}g`} accent="text-emerald-600" />
        <Stat label="Carbs" value={`${Math.round(totals.carbsG)}g`} accent="text-amber-600" />
        <Stat label="Fat" value={`${Math.round(totals.fatG)}g`} accent="text-rose-600" />
        <Stat label="Fiber" value={`${Math.round(totals.fiberG)}g`} accent="text-sky-600" />
      </Card>
    </div>
  );
}

function LogItem({
  log,
  onUpdatePortion,
  onDelete,
  disabled,
}: {
  log: FoodLog;
  onUpdatePortion: (portionG: number) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.portionG);
  const Icon = MEAL_ICON[log.mealType ?? ""] ?? UtensilsCrossed;

  return (
    <li className="px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold capitalize">{log.foodName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{log.portionG}g</span> ·{" "}
            <span className="tabular-nums">{Math.round(log.calories)}</span> kcal ·{" "}
            <span className="tabular-nums">{Math.round(log.proteinG)}</span>g P ·{" "}
            <span className="tabular-nums">{Math.round(log.carbsG)}</span>g C ·{" "}
            <span className="tabular-nums">{Math.round(log.fatG)}</span>g F
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setDraft(log.portionG);
              setEditing((e) => !e);
            }}
            aria-label="Edit portion"
            disabled={disabled}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            aria-label="Delete log"
            disabled={disabled}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {editing && (
        <div
          className={cn(
            "mt-3 rounded-md border bg-muted/30 p-3",
            "flex flex-col gap-3 sm:flex-row sm:items-center",
          )}
        >
          <Slider
            className="flex-1"
            min={10}
            max={500}
            step={5}
            value={[draft]}
            onValueChange={(v) => setDraft(v[0] ?? draft)}
            aria-label="Portion grams"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">{draft}g</span>
            <Button
              size="sm"
              onClick={() => {
                onUpdatePortion(draft);
                setEditing(false);
              }}
              disabled={disabled || draft === log.portionG}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div>
      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums", accent)}>{value}</p>
    </div>
  );
}

function mealOrder(mealType: string): number {
  const idx = MEAL_ORDER.indexOf(mealType as MealType);
  return idx === -1 ? 99 : idx;
}
