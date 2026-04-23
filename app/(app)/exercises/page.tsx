"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExerciseFilters,
  type FilterState,
  type Facets,
} from "@/components/exercises/ExerciseFilters";
import {
  ExerciseCard,
  type LibraryExercise,
} from "@/components/exercises/ExerciseCard";
import { useDebounce } from "@/lib/use-debounce";

interface ExercisesResponse {
  total: number;
  exercises: LibraryExercise[];
  facets: Facets;
}

async function fetchExercises(state: FilterState): Promise<ExercisesResponse> {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  for (const c of state.categories) params.append("category", c);
  for (const m of state.muscles) params.append("muscle", m);
  for (const e of state.equipment) params.append("equipment", e);
  const res = await fetch(`/api/exercises?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load exercises");
  return res.json();
}

export default function ExerciseLibraryPage() {
  const [filters, setFilters] = useState<FilterState>({
    q: "",
    categories: new Set(),
    muscles: new Set(),
    equipment: new Set(),
  });
  const debouncedQ = useDebounce(filters.q, 250);

  const queryKey = useMemo(
    () => [
      "exercises",
      debouncedQ,
      Array.from(filters.categories).sort(),
      Array.from(filters.muscles).sort(),
      Array.from(filters.equipment).sort(),
    ],
    [debouncedQ, filters.categories, filters.muscles, filters.equipment],
  );

  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchExercises({ ...filters, q: debouncedQ }),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Exercise library</h1>
        <p className="text-sm text-muted-foreground">
          50 moves · filter by muscle, category, or equipment.
        </p>
      </div>

      <ExerciseFilters
        facets={data?.facets ?? { categories: [], muscles: [], equipment: [], difficulties: [] }}
        value={filters}
        onChange={setFilters}
      />

      <div className="flex items-baseline justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Results
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {data ? `${data.total} match${data.total === 1 ? "" : "es"}` : "…"}
        </p>
      </div>

      {isPending && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <Card className="p-4 text-sm text-destructive">Failed to load exercises.</Card>
      )}

      {data && data.exercises.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No exercises match these filters — tap the × to clear.
        </Card>
      )}

      <ul className="space-y-2">
        {data?.exercises.map((ex) => (
          <li key={ex.id}>
            <ExerciseCard ex={ex} />
          </li>
        ))}
      </ul>
    </div>
  );
}
