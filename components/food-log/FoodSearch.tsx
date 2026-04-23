"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, Utensils } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/use-debounce";
import type { FoodSearchResult } from "@/types/food-log";

interface Props {
  onPick: (food: FoodSearchResult) => void;
  dietFilter?: "veg" | "non-veg" | "mixed";
}

async function searchFoods(q: string, veg?: "true" | "false"): Promise<FoodSearchResult[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (veg) params.set("veg", veg);
  const res = await fetch(`/api/foods/search?${params.toString()}`);
  if (!res.ok) throw new Error("Search failed");
  const body = (await res.json()) as { foods: FoodSearchResult[] };
  return body.foods;
}

export function FoodSearch({ onPick, dietFilter }: Props) {
  const [q, setQ] = useState("");
  const [vegOnly, setVegOnly] = useState(dietFilter === "veg");
  const dq = useDebounce(q, 250);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["foods-search", dq, vegOnly],
    queryFn: () => searchFoods(dq, vegOnly ? "true" : undefined),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          placeholder="Search foods (paneer, dal, rice…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
          autoFocus
          inputMode="search"
          aria-label="Search foods"
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setVegOnly((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
            vegOnly
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-border bg-background text-muted-foreground",
          )}
          aria-pressed={vegOnly}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Veg only
        </button>
        {isFetching && (
          <span className="text-xs text-muted-foreground">Searching…</span>
        )}
      </div>

      {isError && (
        <p className="text-sm text-destructive">Search failed. Try again.</p>
      )}

      {data && data.length === 0 && q.trim() !== "" && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No matches for &quot;{q}&quot;. Try another spelling.
        </p>
      )}

      {!data && !isFetching && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {data.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onPick(f)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-md",
                    f.isVeg
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700",
                  )}
                  aria-hidden
                >
                  <Utensils className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold capitalize">{f.name}</p>
                    {f.nameHindi && (
                      <span className="truncate text-xs text-muted-foreground">
                        {f.nameHindi}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">{f.caloriesPer100g}</span> kcal ·{" "}
                    <span className="tabular-nums">{f.proteinG}</span>g P ·{" "}
                    <span className="tabular-nums">{f.carbsG}</span>g C ·{" "}
                    <span className="tabular-nums">{f.fatG}</span>g F
                    <span className="ml-1 text-muted-foreground/70">
                      per 100g
                    </span>
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {f.servingDescription ?? `${f.servingSizeG}g`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
