"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Dumbbell,
  Flame,
  MoonStar,
  Move,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WorkoutRow {
  id: number;
  dayNumber: number;
  name: string;
  category: string;
  durationMin: number;
  description: string | null;
  exerciseCount: number;
  completedToday: boolean;
}

const CATEGORY: Record<string, { icon: LucideIcon; bg: string; fg: string; label: string }> = {
  push: { icon: Dumbbell, bg: "bg-rose-500/10", fg: "text-rose-600", label: "Push" },
  pull: { icon: Dumbbell, bg: "bg-indigo-500/10", fg: "text-indigo-600", label: "Pull" },
  legs: { icon: Move, bg: "bg-amber-500/10", fg: "text-amber-600", label: "Legs" },
  hiit: { icon: Flame, bg: "bg-orange-500/10", fg: "text-orange-600", label: "HIIT" },
  fullbody: { icon: Activity, bg: "bg-emerald-500/10", fg: "text-emerald-600", label: "Full body" },
  cardio: { icon: Sun, bg: "bg-sky-500/10", fg: "text-sky-600", label: "Cardio" },
  rest: { icon: MoonStar, bg: "bg-muted", fg: "text-muted-foreground", label: "Rest" },
};

async function fetchAll(): Promise<{ today: number; workouts: WorkoutRow[] }> {
  const res = await fetch("/api/workouts");
  if (!res.ok) throw new Error("Failed to load workouts");
  return res.json();
}

export default function WorkoutListPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ["workouts", "all"],
    queryFn: fetchAll,
  });

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Failed to load workouts.
      </Card>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Workouts</h1>
        <p className="text-sm text-muted-foreground">
          6-day home split · 1 rest day · start any day at any time.
        </p>
      </div>

      <ul className="space-y-3">
        {data.workouts.map((w) => {
          const meta = CATEGORY[w.category] ?? CATEGORY.fullbody!;
          const Icon = meta.icon;
          const isToday = w.dayNumber === data.today;
          return (
            <li key={w.id}>
              <Link
                href={w.category === "rest" ? "#" : `/workout/${w.id}`}
                aria-disabled={w.category === "rest"}
                className={cn(
                  "block",
                  w.category === "rest" && "pointer-events-none",
                )}
              >
                <Card
                  className={cn(
                    "flex items-center gap-3 p-4 transition-colors",
                    isToday && "border-primary shadow-sm",
                  )}
                >
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", meta.bg, meta.fg)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Day {w.dayNumber} · {meta.label}
                      </p>
                      {isToday && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-semibold text-primary">
                          Today
                        </span>
                      )}
                      {w.completedToday && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" aria-hidden /> Done
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-semibold">{w.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">{w.exerciseCount}</span> exercise{w.exerciseCount === 1 ? "" : "s"} ·{" "}
                      <span className="tabular-nums">{w.durationMin}</span> min
                    </p>
                  </div>
                  {w.category !== "rest" && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  )}
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
