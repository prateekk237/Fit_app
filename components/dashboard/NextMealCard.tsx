"use client";

import Link from "next/link";
import {
  Coffee,
  Sun,
  Cookie,
  Moon,
  UtensilsCrossed,
  Dumbbell,
  ArrowRight,
  Apple,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface NextMeal {
  id: number;
  label: string;
  mealType: string;
  name: string;
  description: string | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  minutesUntil: number;
  isUpcoming: boolean;
  window: { start: number; end: number; label: string } | null;
}

interface Props {
  nextMeal: NextMeal | null;
}

const ICONS: Record<string, LucideIcon> = {
  "pre-workout": Dumbbell,
  breakfast: Coffee,
  "mid-morning": Apple,
  lunch: Sun,
  snack: Cookie,
  "post-workout": Dumbbell,
  dinner: Moon,
};

function formatMinutesUntil(mins: number, isUpcoming: boolean) {
  if (!isUpcoming) return "Open now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

function formatWindow(win: { start: number; end: number } | null) {
  if (!win) return null;
  const fmt = (f: number) => {
    const h = Math.floor(f);
    const m = Math.round((f - h) * 60);
    return `${h}:${m.toString().padStart(2, "0")}`;
  };
  return `${fmt(win.start)}–${fmt(win.end)}`;
}

export function NextMealCard({ nextMeal }: Props) {
  if (!nextMeal) {
    return (
      <Card className="flex min-h-[180px] flex-col items-start justify-between p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Next meal
          </p>
          <p className="mt-2 text-lg font-semibold">You&apos;re done for today 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No more meals on the plan. Logging anything extra? Use the Log tab.
          </p>
        </div>
        <Link
          href="/log"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open food log <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>
    );
  }

  const Icon = ICONS[nextMeal.mealType] ?? UtensilsCrossed;
  const timing = formatMinutesUntil(nextMeal.minutesUntil, nextMeal.isUpcoming);
  const window = formatWindow(nextMeal.window);

  return (
    <Card className="flex min-h-[180px] flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {nextMeal.label}
          </p>
          <p
            className={cn(
              "mt-1 text-[0.7rem] font-medium",
              nextMeal.isUpcoming ? "text-muted-foreground" : "text-emerald-600",
            )}
          >
            {timing}
            {window && <span className="ml-1 text-muted-foreground/80">· {window}</span>}
          </p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug">{nextMeal.name}</h3>
      {nextMeal.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {nextMeal.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-4">
        <div className="text-xs text-muted-foreground">
          {nextMeal.targetCalories != null && (
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{nextMeal.targetCalories}</span> kcal
            </span>
          )}
          {nextMeal.targetProteinG != null && (
            <span className="ml-2 tabular-nums">
              <span className="font-semibold text-foreground">{nextMeal.targetProteinG}g</span> protein
            </span>
          )}
        </div>
        <Link
          href={`/meals?day=${new Date().getDay() || 7}&focus=${nextMeal.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Log <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
