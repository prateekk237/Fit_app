"use client";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

const LABELS: Record<number, string> = {
  1: "Very easy",
  2: "Easy",
  3: "Moderate",
  4: "Somewhat hard",
  5: "Hard",
  6: "Hard",
  7: "Very hard",
  8: "Very hard",
  9: "Near max",
  10: "Max effort",
};

export function RpeSlider({ value, onChange }: Props) {
  const color =
    value <= 4 ? "text-emerald-600" : value <= 7 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Session RPE
          </p>
          <p className="text-xs text-muted-foreground">How hard was it? 1 (easy) → 10 (max)</p>
        </div>
        <div className={cn("text-3xl font-bold tabular-nums", color)}>
          {value}
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            /10
          </span>
        </div>
      </div>
      <Slider
        min={1}
        max={10}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label="RPE rating"
      />
      <p className="text-right text-xs text-muted-foreground">{LABELS[value]}</p>
    </div>
  );
}
