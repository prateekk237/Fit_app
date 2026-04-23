"use client";

import { cn } from "@/lib/utils";

interface Macro {
  label: string;
  value: number;
  target: number;
  unit: string;
  accent: string;
  trackClass: string;
  barClass: string;
}

interface Props {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  targetFiberG?: number;
}

export function MacroBars({
  proteinG,
  carbsG,
  fatG,
  fiberG,
  targetProteinG,
  targetCarbsG,
  targetFatG,
  targetFiberG = 35,
}: Props) {
  const macros: Macro[] = [
    {
      label: "Protein",
      value: proteinG,
      target: targetProteinG,
      unit: "g",
      accent: "text-emerald-600",
      trackClass: "bg-emerald-100 dark:bg-emerald-900/30",
      barClass: "bg-gradient-to-r from-emerald-500 to-emerald-600",
    },
    {
      label: "Carbs",
      value: carbsG,
      target: targetCarbsG,
      unit: "g",
      accent: "text-amber-600",
      trackClass: "bg-amber-100 dark:bg-amber-900/30",
      barClass: "bg-gradient-to-r from-amber-500 to-amber-600",
    },
    {
      label: "Fat",
      value: fatG,
      target: targetFatG,
      unit: "g",
      accent: "text-rose-600",
      trackClass: "bg-rose-100 dark:bg-rose-900/30",
      barClass: "bg-gradient-to-r from-rose-500 to-rose-600",
    },
    {
      label: "Fiber",
      value: fiberG,
      target: targetFiberG,
      unit: "g",
      accent: "text-sky-600",
      trackClass: "bg-sky-100 dark:bg-sky-900/30",
      barClass: "bg-gradient-to-r from-sky-500 to-sky-600",
    },
  ];

  return (
    <div className="space-y-3">
      {macros.map((m) => {
        const pct = m.target > 0 ? Math.min(100, (m.value / m.target) * 100) : 0;
        const over = m.value > m.target && m.target > 0;
        return (
          <div key={m.label}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">{m.label}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className={cn("font-semibold", m.accent)}>{Math.round(m.value)}</span>
                {` / ${m.target}${m.unit}`}
              </span>
            </div>
            <div className={cn("h-2 w-full overflow-hidden rounded-full", m.trackClass)}>
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  m.barClass,
                  over && "ring-2 ring-destructive/40",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
