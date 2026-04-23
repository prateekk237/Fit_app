"use client";

import { cn } from "@/lib/utils";

type VegMode = "all" | "veg" | "non-veg";

interface Props {
  value: VegMode;
  onChange: (v: VegMode) => void;
}

export function DietToggle({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Diet filter"
      className="inline-flex rounded-full border bg-muted p-0.5 text-xs"
    >
      {([
        { k: "all", label: "All" },
        { k: "veg", label: "Veg" },
        { k: "non-veg", label: "Non-veg" },
      ] as const).map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.k)}
            className={cn(
              "rounded-full px-3 py-1 font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export type { VegMode };
