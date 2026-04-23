"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalorieRing } from "@/components/dashboard/CalorieRing";
import { MacroBars } from "@/components/dashboard/MacroBars";
import { WaterDroplets } from "@/components/dashboard/WaterDroplets";
import { NextMealCard, type NextMeal } from "@/components/dashboard/NextMealCard";
import {
  TodayWorkoutCard,
  type TodayWorkout,
} from "@/components/dashboard/TodayWorkoutCard";
import { StreakBadge } from "@/components/dashboard/StreakBadge";
import { WeightTrendCard } from "@/components/dashboard/WeightTrendCard";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";

interface DashboardData {
  date: string;
  timezone: string;
  dayOfWeek: number;
  user: { name: string; birthDate: string };
  targets: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    waterMl: number;
  };
  consumed: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    itemsLogged: number;
  };
  water: { consumedMl: number };
  streakDays: number;
  nextMeal: NextMeal | null;
  todayWorkout: TodayWorkout | null;
  weight: {
    currentKg: number;
    targetKg: number;
    startKg: number;
    sevenDayAvgKg: number | null;
    lastLoggedDate: string | null;
    sparkline: { date: string; kg: number }[];
  };
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/dashboard/today");
  if (!res.ok) throw new Error("Failed to load dashboard");
  return res.json();
}

export default function DashboardPage() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
  });

  if (isPending) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <Card className="p-6">
        <p className="mb-3 text-sm text-destructive">Could not load today&apos;s dashboard.</p>
        <button
          className="text-sm font-semibold text-primary hover:underline"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold leading-tight">
            Hi {data.user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(data.date), "EEEE · d MMM yyyy")}
          </p>
        </div>
        <StreakBadge days={data.streakDays} />
      </header>

      {/* Main ring + macros in a single card, responsive 2-col on wider screens */}
      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center md:gap-8">
          <div className="flex justify-center">
            <CalorieRing
              consumed={data.consumed.calories}
              target={data.targets.calories}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Macros
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {data.consumed.itemsLogged} item{data.consumed.itemsLogged === 1 ? "" : "s"} logged
              </span>
            </div>
            <MacroBars
              proteinG={data.consumed.proteinG}
              carbsG={data.consumed.carbsG}
              fatG={data.consumed.fatG}
              fiberG={data.consumed.fiberG}
              targetProteinG={data.targets.proteinG}
              targetCarbsG={data.targets.carbsG}
              targetFatG={data.targets.fatG}
            />
          </div>
        </CardContent>
      </Card>

      {/* Water */}
      <Card>
        <CardContent className="p-5">
          <WaterDroplets
            consumedMl={data.water.consumedMl}
            targetMl={data.targets.waterMl}
          />
        </CardContent>
      </Card>

      {/* Next meal + today's workout */}
      <section className="grid gap-4 md:grid-cols-2">
        <NextMealCard nextMeal={data.nextMeal} />
        <TodayWorkoutCard workout={data.todayWorkout} />
      </section>

      {/* Weight trend */}
      <WeightTrendCard
        currentKg={data.weight.currentKg}
        targetKg={data.weight.targetKg}
        startKg={data.weight.startKg}
        sevenDayAvgKg={data.weight.sevenDayAvgKg}
        lastLoggedDate={data.weight.lastLoggedDate}
        sparkline={data.weight.sparkline}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Day on a page</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-center">
          <Stat
            label="Calories left"
            value={Math.max(
              0,
              data.targets.calories - data.consumed.calories,
            ).toLocaleString()}
          />
          <Stat
            label="Protein left"
            value={`${Math.max(0, data.targets.proteinG - Math.round(data.consumed.proteinG))}g`}
          />
          <Stat
            label="Water left"
            value={`${Math.max(0, data.targets.waterMl - data.water.consumedMl).toLocaleString()} ml`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
