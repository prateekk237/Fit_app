"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SetEntry {
  reps?: number;
  weightKg?: number;
  completed: boolean;
}

interface Props {
  sets: SetEntry[];
  targetReps?: string | number;
  onChange: (sets: SetEntry[]) => void;
  onCompleteSet?: (index: number) => void;
}

export function SetTracker({ sets, targetReps, onChange, onCompleteSet }: Props) {
  function update(i: number, patch: Partial<SetEntry>) {
    onChange(sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addSet() {
    const last = sets[sets.length - 1];
    onChange([
      ...sets,
      {
        reps: last?.reps,
        weightKg: last?.weightKg,
        completed: false,
      },
    ]);
  }
  function removeSet(i: number) {
    onChange(sets.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-2 px-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="w-6">Set</span>
        <span>Reps{targetReps != null && <span className="ml-1 font-normal normal-case">({String(targetReps)})</span>}</span>
        <span>Weight (kg)</span>
        <span className="w-9 text-center">✓</span>
        <span className="w-9" />
      </div>
      {sets.map((s, i) => (
        <div
          key={i}
          className={cn(
            "grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-2",
            s.completed && "opacity-75",
          )}
        >
          <span className="w-6 text-center text-sm font-semibold tabular-nums">{i + 1}</span>
          <Input
            type="number"
            inputMode="numeric"
            className="h-9 text-center tabular-nums"
            placeholder="–"
            value={s.reps ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              update(i, { reps: Number.isFinite(v) ? (v as number) : undefined });
            }}
            aria-label={`Set ${i + 1} reps`}
          />
          <Input
            type="number"
            step="0.5"
            inputMode="decimal"
            className="h-9 text-center tabular-nums"
            placeholder="0"
            value={s.weightKg ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              update(i, { weightKg: Number.isFinite(v) ? (v as number) : undefined });
            }}
            aria-label={`Set ${i + 1} weight`}
          />
          <Button
            size="icon"
            variant={s.completed ? "default" : "outline"}
            className={cn(
              "h-9 w-9",
              s.completed && "bg-emerald-600 hover:bg-emerald-600",
            )}
            onClick={() => {
              const next = !s.completed;
              update(i, { completed: next });
              if (next && onCompleteSet) onCompleteSet(i);
            }}
            aria-label={s.completed ? "Mark set incomplete" : "Mark set complete"}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            onClick={() => removeSet(i)}
            aria-label={`Delete set ${i + 1}`}
            disabled={sets.length <= 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={addSet}>
        <Plus className="mr-1 h-4 w-4" /> Add set
      </Button>
    </div>
  );
}
