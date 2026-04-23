"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Facets {
  categories: string[];
  muscles: string[];
  equipment: string[];
  difficulties: string[];
}

export interface FilterState {
  q: string;
  categories: Set<string>;
  muscles: Set<string>;
  equipment: Set<string>;
}

interface Props {
  facets: Facets;
  value: FilterState;
  onChange: (next: FilterState) => void;
}

export function ExerciseFilters({ facets, value, onChange }: Props) {
  function toggle(key: "categories" | "muscles" | "equipment", v: string) {
    const next = new Set(value[key]);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange({ ...value, [key]: next });
  }
  const hasAny =
    value.q.trim().length > 0 ||
    value.categories.size > 0 ||
    value.muscles.size > 0 ||
    value.equipment.size > 0;

  function clear() {
    onChange({ q: "", categories: new Set(), muscles: new Set(), equipment: new Set() });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          placeholder="Search exercises (push, squat, row…)"
          className="pl-9 pr-9"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          inputMode="search"
        />
        {hasAny && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
            aria-label="Clear filters"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div>
        <p className="mb-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Category
        </p>
        <ChipStrip
          options={facets.categories}
          selected={value.categories}
          onToggle={(v) => toggle("categories", v)}
          accent="primary"
        />
      </div>

      <div>
        <p className="mb-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Muscles
        </p>
        <ChipStrip
          options={facets.muscles}
          selected={value.muscles}
          onToggle={(v) => toggle("muscles", v)}
          accent="emerald"
        />
      </div>

      {facets.equipment.length > 0 && (
        <div>
          <p className="mb-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Equipment
          </p>
          <ChipStrip
            options={facets.equipment}
            selected={value.equipment}
            onToggle={(v) => toggle("equipment", v)}
            accent="amber"
          />
        </div>
      )}
    </div>
  );
}

function ChipStrip({
  options,
  selected,
  onToggle,
  accent,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  accent: "primary" | "emerald" | "amber";
}) {
  const activeClass = {
    primary: "border-primary bg-primary text-primary-foreground",
    emerald: "border-emerald-500 bg-emerald-500 text-white",
    amber: "border-amber-500 bg-amber-500 text-white",
  }[accent];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.has(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors capitalize",
              active
                ? activeClass
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
