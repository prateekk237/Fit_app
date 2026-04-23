"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  MoonStar,
  Activity,
  Move,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TodayWorkout {
  id: number;
  dayNumber: number;
  name: string;
  category: string;
  durationMin: number;
  description: string | null;
  exerciseCount: number;
  completedToday: boolean;
  inProgress: boolean;
}

interface Props {
  workout: TodayWorkout | null;
}

const CATEGORY_META: Record<
  string,
  { icon: LucideIcon; bg: string; fg: string; label: string }
> = {
  push: { icon: Dumbbell, bg: "bg-rose-500/10", fg: "text-rose-600", label: "Push" },
  pull: { icon: Dumbbell, bg: "bg-indigo-500/10", fg: "text-indigo-600", label: "Pull" },
  legs: { icon: Move, bg: "bg-amber-500/10", fg: "text-amber-600", label: "Legs" },
  hiit: { icon: Flame, bg: "bg-orange-500/10", fg: "text-orange-600", label: "HIIT + Core" },
  fullbody: { icon: Activity, bg: "bg-emerald-500/10", fg: "text-emerald-600", label: "Full body" },
  cardio: { icon: Activity, bg: "bg-sky-500/10", fg: "text-sky-600", label: "Cardio" },
  rest: { icon: MoonStar, bg: "bg-muted", fg: "text-muted-foreground", label: "Rest day" },
};

export function TodayWorkoutCard({ workout }: Props) {
  if (!workout) {
    return (
      <Card className="flex min-h-[180px] items-center justify-center p-5">
        <p className="text-sm text-muted-foreground">No workout scheduled.</p>
      </Card>
    );
  }

  const meta = CATEGORY_META[workout.category] ?? CATEGORY_META.fullbody!;
  const Icon = meta.icon;
  const isRest = workout.category === "rest";

  const status = workout.completedToday
    ? { label: "Completed", icon: CheckCircle2, className: "text-emerald-600" }
    : workout.inProgress
    ? { label: "In progress", icon: Clock, className: "text-amber-600" }
    : { label: `${workout.durationMin} min`, icon: Clock, className: "text-muted-foreground" };

  return (
    <Card className="flex min-h-[180px] flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Day {workout.dayNumber} · {meta.label}
          </p>
          <p
            className={cn("mt-1 flex items-center gap-1 text-[0.7rem]", status.className)}
          >
            <status.icon className="h-3 w-3" aria-hidden />
            {status.label}
          </p>
        </div>
        <div className={cn("rounded-lg p-2", meta.bg, meta.fg)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug">{workout.name}</h3>
      {workout.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{workout.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-4">
        <div className="text-xs text-muted-foreground">
          {isRest ? (
            <span>Active recovery · stretch + walk</span>
          ) : (
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{workout.exerciseCount}</span> exercises
            </span>
          )}
        </div>
        <Link
          href={`/workout/${workout.id}`}
          className={cn(
            "inline-flex items-center gap-1 text-sm font-medium hover:underline",
            isRest ? "text-muted-foreground" : "text-primary",
          )}
        >
          {workout.completedToday ? "Review" : isRest ? "See plan" : "Start"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
