"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, CalendarRange } from "lucide-react";
import { FoodSearch } from "@/components/food-log/FoodSearch";
import { PortionEditor } from "@/components/food-log/PortionEditor";
import { DailyLogList } from "@/components/food-log/DailyLogList";
import type {
  FoodLog,
  FoodLogsResponse,
  FoodSearchResult,
  MealType,
} from "@/types/food-log";

async function fetchLogs(): Promise<FoodLogsResponse> {
  const res = await fetch("/api/food-logs");
  if (!res.ok) throw new Error("Failed to load logs");
  return res.json();
}

async function createLog(body: {
  foodId: number;
  portionG: number;
  mealType: MealType;
}): Promise<FoodLog> {
  const res = await fetch("/api/food-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
  return res.json();
}

async function patchLog(id: string, portionG: number): Promise<FoodLog> {
  const res = await fetch(`/api/food-logs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ portionG }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
  return res.json();
}

async function deleteLog(id: string): Promise<void> {
  const res = await fetch(`/api/food-logs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

function currentMealType(): MealType {
  const h = new Date().getHours();
  if (h < 7) return "pre-workout";
  if (h < 10) return "breakfast";
  if (h < 12) return "mid-morning";
  if (h < 15) return "lunch";
  if (h < 17) return "snack";
  if (h < 19) return "post-workout";
  return "dinner";
}

export default function LogPage() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["food-logs", "today"],
    queryFn: fetchLogs,
  });

  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);

  // Create — optimistic insert into the logs list.
  const createMutation = useMutation({
    mutationFn: createLog,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["food-logs", "today"] });
      const prev = qc.getQueryData<FoodLogsResponse>(["food-logs", "today"]);
      if (prev && selectedFood) {
        const factor = input.portionG / 100;
        const optimistic: FoodLog = {
          id: `optimistic-${Date.now()}`,
          loggedAt: new Date().toISOString(),
          logDate: prev.date,
          foodId: selectedFood.id,
          foodName: selectedFood.name,
          portionG: input.portionG,
          calories: selectedFood.caloriesPer100g * factor,
          proteinG: selectedFood.proteinG * factor,
          carbsG: selectedFood.carbsG * factor,
          fatG: selectedFood.fatG * factor,
          fiberG: selectedFood.fiberG != null ? selectedFood.fiberG * factor : null,
          source: "manual",
          mealType: input.mealType,
        };
        qc.setQueryData<FoodLogsResponse>(["food-logs", "today"], {
          ...prev,
          logs: [...prev.logs, optimistic],
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(["food-logs", "today"], ctx.prev);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-logs", "today"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, portionG }: { id: string; portionG: number }) => patchLog(id, portionG),
    onMutate: async ({ id, portionG }) => {
      await qc.cancelQueries({ queryKey: ["food-logs", "today"] });
      const prev = qc.getQueryData<FoodLogsResponse>(["food-logs", "today"]);
      if (prev) {
        qc.setQueryData<FoodLogsResponse>(["food-logs", "today"], {
          ...prev,
          logs: prev.logs.map((l) => {
            if (l.id !== id) return l;
            const ratio = portionG / l.portionG;
            return {
              ...l,
              portionG,
              calories: l.calories * ratio,
              proteinG: l.proteinG * ratio,
              carbsG: l.carbsG * ratio,
              fatG: l.fatG * ratio,
              fiberG: l.fiberG != null ? l.fiberG * ratio : null,
            };
          }),
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(["food-logs", "today"], ctx.prev);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-logs", "today"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLog,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["food-logs", "today"] });
      const prev = qc.getQueryData<FoodLogsResponse>(["food-logs", "today"]);
      if (prev) {
        qc.setQueryData<FoodLogsResponse>(["food-logs", "today"], {
          ...prev,
          logs: prev.logs.filter((l) => l.id !== id),
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(["food-logs", "today"], ctx.prev);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-logs", "today"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    },
  });

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold">Log food</h1>
        <p className="text-sm text-muted-foreground">
          Search, edit portion, or delete — your dashboard updates instantly.
        </p>
      </div>

      <Tabs defaultValue="search" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="photo" asChild>
            <Link href="/log/photo" className="flex items-center gap-1.5">
              <Camera className="h-4 w-4" aria-hidden /> Photo
            </Link>
          </TabsTrigger>
          <TabsTrigger value="meals" asChild>
            <Link href="/meals" className="flex items-center gap-1.5">
              <CalendarRange className="h-4 w-4" aria-hidden /> Plan
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4 space-y-5">
          <FoodSearch onPick={(f) => setSelectedFood(f)} />
        </TabsContent>
      </Tabs>

      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today
        </h2>
        {isPending && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}
        {error && (
          <Card className="p-4 text-sm text-destructive">Failed to load today&apos;s logs.</Card>
        )}
        {data && (
          <DailyLogList
            logs={data.logs}
            onUpdatePortion={(log, portionG) =>
              patchMutation.mutate({ id: log.id, portionG })
            }
            onDelete={(log) => deleteMutation.mutate(log.id)}
            isMutating={
              patchMutation.isPending ||
              deleteMutation.isPending ||
              createMutation.isPending
            }
          />
        )}
      </section>

      <PortionEditor
        food={selectedFood}
        defaultMealType={currentMealType()}
        onClose={() => setSelectedFood(null)}
        saving={createMutation.isPending}
        onSave={async ({ portionG, mealType }) => {
          if (!selectedFood) return;
          try {
            await createMutation.mutateAsync({
              foodId: selectedFood.id,
              portionG,
              mealType,
            });
            setSelectedFood(null);
          } catch {
            // inline error already shown via createMutation.error if needed
          }
        }}
      />
    </div>
  );
}
