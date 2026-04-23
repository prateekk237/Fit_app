"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { MEAL_TYPE_LABEL, type MealType, type FoodSearchResult } from "@/types/food-log";

interface Props {
  food: FoodSearchResult | null;
  defaultMealType: MealType;
  onClose: () => void;
  onSave: (args: { portionG: number; mealType: MealType }) => Promise<void>;
  saving?: boolean;
}

const QUICK_PICKS = [50, 100, 150, 200];
const SLIDER_MIN = 10;
const SLIDER_MAX = 500;
const SLIDER_STEP = 5;

export function PortionEditor({ food, defaultMealType, onClose, onSave, saving = false }: Props) {
  const [portionG, setPortionG] = useState<number>(100);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);

  // Keep state fresh across opens.
  const key = food?.id ?? "none";
  useMemoReset(key, () => {
    setPortionG(Math.round(food?.servingSizeG ?? 100));
    setMealType(defaultMealType);
  });

  const preview = useMemo(() => {
    if (!food) return null;
    const f = portionG / 100;
    return {
      calories: Math.round(food.caloriesPer100g * f),
      proteinG: round1(food.proteinG * f),
      carbsG: round1(food.carbsG * f),
      fatG: round1(food.fatG * f),
      fiberG: food.fiberG != null ? round1(food.fiberG * f) : null,
    };
  }, [food, portionG]);

  const open = !!food;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        {food && preview && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="capitalize">{food.name}</SheetTitle>
              <SheetDescription>
                {food.nameHindi ? `${food.nameHindi} · ` : ""}
                {food.caloriesPer100g} kcal / 100g
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Live macro preview */}
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                      Portion
                    </p>
                    <p className="text-3xl font-bold tabular-nums">
                      {portionG}
                      <span className="ml-1 text-base font-medium text-muted-foreground">g</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                      Calories
                    </p>
                    <p className="text-3xl font-bold tabular-nums text-primary">
                      {preview.calories}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <MacroPill label="Protein" value={preview.proteinG} accent="text-emerald-600" />
                  <MacroPill label="Carbs" value={preview.carbsG} accent="text-amber-600" />
                  <MacroPill label="Fat" value={preview.fatG} accent="text-rose-600" />
                  <MacroPill label="Fiber" value={preview.fiberG ?? 0} accent="text-sky-600" />
                </div>
              </div>

              {/* Slider */}
              <div className="space-y-3">
                <Slider
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  step={SLIDER_STEP}
                  value={[portionG]}
                  onValueChange={(v) => setPortionG(v[0] ?? portionG)}
                  aria-label="Portion grams"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-2">
                    {QUICK_PICKS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setPortionG(g)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          portionG === g
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {g}g
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="portion-input" className="text-xs text-muted-foreground">
                      Custom
                    </Label>
                    <Input
                      id="portion-input"
                      type="number"
                      min={SLIDER_MIN}
                      max={SLIDER_MAX}
                      step={1}
                      value={portionG}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0) setPortionG(Math.min(SLIDER_MAX, Math.round(n)));
                      }}
                      className="h-9 w-24 text-right tabular-nums"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              {/* Meal type */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Meal
                </Label>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                  {(Object.keys(MEAL_TYPE_LABEL) as MealType[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setMealType(k)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                        mealType === k
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {MEAL_TYPE_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={saving || portionG <= 0}
                  onClick={() => onSave({ portionG, mealType })}
                >
                  {saving ? "Saving…" : `Log ${preview.calories} kcal`}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MacroPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-md bg-background px-2 py-2">
      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold tabular-nums", accent)}>
        {value}
        <span className="ml-0.5 text-[0.6rem] font-medium text-muted-foreground">g</span>
      </p>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Reset internal state whenever `key` changes. Replaces a useEffect.
function useMemoReset(key: string | number, fn: () => void) {
  useMemo(() => {
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
