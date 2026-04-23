"use client";

import { Droplet } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  consumedMl: number;
  targetMl: number;
  stepMl?: number;
}

export function WaterDroplets({ consumedMl, targetMl, stepMl = 250 }: Props) {
  const steps = Math.max(1, Math.ceil(targetMl / stepMl));
  const filled = Math.min(steps, Math.round(consumedMl / stepMl));
  const percent = Math.min(100, (consumedMl / targetMl) * 100);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Droplet className="h-4 w-4 text-sky-500" aria-hidden />
          <span className="text-sm font-medium">Water</span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-sky-600">{consumedMl.toLocaleString()}</span>
          {` / ${targetMl.toLocaleString()} ml`}
        </span>
      </div>
      <div className="grid grid-cols-8 gap-1.5 md:grid-cols-15">
        {Array.from({ length: steps }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <div
              key={i}
              className={cn(
                "flex h-8 items-center justify-center rounded-md border text-[0.65rem] font-semibold transition-colors",
                isFilled
                  ? "border-sky-500 bg-sky-500 text-white shadow-sm shadow-sky-500/30"
                  : "border-dashed border-muted-foreground/30 bg-muted text-transparent",
              )}
              aria-label={`${stepMl} ml ${isFilled ? "filled" : "empty"}`}
            >
              <Droplet className="h-3.5 w-3.5" aria-hidden />
            </div>
          );
        })}
      </div>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/30"
        aria-hidden
      >
        <div
          className="h-full bg-gradient-to-r from-sky-400 to-sky-600 transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
