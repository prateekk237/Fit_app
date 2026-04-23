"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEAL_TYPE_LABEL, type MealType } from "@/types/food-log";

export interface DetectedItem {
  id: string; // client-side only
  name: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isVeg: boolean;
  /** Normalised per-item confidence 0-1. Aggregated from the overall AI confidence. */
  confidence: number;
}

export interface AiResultShape {
  foods: Array<{
    name: string;
    name_hindi?: string | null;
    portion_grams: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    is_veg: boolean;
  }>;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  confidence: number;
  notes?: string | undefined;
}

interface Props {
  result: AiResultShape;
  provider: string;
  durationMs: number;
  defaultMealType: MealType;
  saving: boolean;
  savedCount?: number;
  onSave: (items: DetectedItem[], mealType: MealType) => Promise<void>;
  onDiscard: () => void;
}

const LOW_CONF = 0.7;
const HIGH_CONF = 0.85;

export function AiAnalysisResult({
  result,
  provider,
  durationMs,
  defaultMealType,
  saving,
  savedCount,
  onSave,
  onDiscard,
}: Props) {
  const [items, setItems] = useState<DetectedItem[]>(() =>
    result.foods.map((f, i) => ({
      id: `det-${i}`,
      name: f.name,
      portionGrams: f.portion_grams,
      calories: f.calories,
      proteinG: f.protein_g,
      carbsG: f.carbs_g,
      fatG: f.fat_g,
      isVeg: f.is_veg,
      confidence: result.confidence,
    })),
  );
  const [mealType, setMealType] = useState<MealType>(defaultMealType);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, it) => ({
        calories: acc.calories + it.calories,
        proteinG: acc.proteinG + it.proteinG,
        carbsG: acc.carbsG + it.carbsG,
        fatG: acc.fatG + it.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
  }, [items]);

  function patch(id: string, u: Partial<DetectedItem>) {
    setItems((s) => s.map((it) => (it.id === id ? { ...it, ...u } : it)));
  }

  function scalePortion(id: string, nextGrams: number) {
    setItems((s) =>
      s.map((it) => {
        if (it.id !== id) return it;
        const ratio = nextGrams / Math.max(1, it.portionGrams);
        return {
          ...it,
          portionGrams: nextGrams,
          calories: Math.round(it.calories * ratio),
          proteinG: round1(it.proteinG * ratio),
          carbsG: round1(it.carbsG * ratio),
          fatG: round1(it.fatG * ratio),
        };
      }),
    );
  }

  function remove(id: string) {
    setItems((s) => s.filter((it) => it.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Header: overall confidence + provider meta */}
      <Card className={cn("p-4", confidencePanelClass(result.confidence))}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" aria-hidden />
              <p className="text-sm font-semibold">AI detected {items.length} item{items.length === 1 ? "" : "s"}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {provider} · {Math.round(durationMs)}ms ·{" "}
              <span className="font-semibold">{Math.round(result.confidence * 100)}%</span> confidence
            </p>
            {result.notes && (
              <p className="mt-1 text-[0.7rem] text-muted-foreground">{result.notes}</p>
            )}
          </div>
          <ConfidenceChip value={result.confidence} />
        </div>
      </Card>

      {/* Low-confidence reminder banner */}
      {result.confidence < LOW_CONF && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Confidence is low — please double-check portions and delete
            anything that doesn&apos;t belong.
          </p>
        </div>
      )}

      {/* Items */}
      <ul className="space-y-3">
        {items.map((it) => (
          <Item
            key={it.id}
            item={it}
            onName={(v) => patch(it.id, { name: v })}
            onPortion={(g) => scalePortion(it.id, g)}
            onRemove={() => remove(it.id)}
            lowConf={it.confidence < LOW_CONF}
          />
        ))}
      </ul>

      {items.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nothing to save — retake the photo.
        </Card>
      )}

      {/* Meal-type picker */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Meal
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MEAL_TYPE_LABEL) as MealType[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setMealType(k)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
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

      {/* Totals + actions */}
      <Card className="p-4">
        <div className="mb-3 grid grid-cols-4 gap-2 text-center">
          <Stat label="kcal" value={Math.round(totals.calories)} accent="text-primary" />
          <Stat label="Protein" value={`${Math.round(totals.proteinG)}g`} accent="text-emerald-600" />
          <Stat label="Carbs" value={`${Math.round(totals.carbsG)}g`} accent="text-amber-600" />
          <Stat label="Fat" value={`${Math.round(totals.fatG)}g`} accent="text-rose-600" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onDiscard}
            disabled={saving}
          >
            Discard
          </Button>
          <Button
            className="flex-1"
            onClick={() => onSave(items, mealType)}
            disabled={saving || items.length === 0}
          >
            {saving
              ? `Saving ${savedCount ?? 0}/${items.length}…`
              : `Save all (${items.length})`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Item({
  item,
  onName,
  onPortion,
  onRemove,
  lowConf,
}: {
  item: DetectedItem;
  onName: (v: string) => void;
  onPortion: (g: number) => void;
  onRemove: () => void;
  lowConf: boolean;
}) {
  return (
    <li>
      <Card
        className={cn(
          "p-3 transition-colors",
          lowConf && "border-amber-300 bg-amber-50/30 dark:border-amber-800/60 dark:bg-amber-950/10",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
              item.isVeg ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
            )}
            aria-hidden
          >
            <Utensils className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={item.name}
                onChange={(e) => onName(e.target.value)}
                className="h-8 text-sm font-semibold"
                aria-label="Food name"
              />
              <button
                type="button"
                aria-label="Remove item"
                onClick={onRemove}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                className="flex-1"
                min={10}
                max={500}
                step={5}
                value={[item.portionGrams]}
                onValueChange={(v) => onPortion(v[0] ?? item.portionGrams)}
                aria-label="Portion grams"
              />
              <span className="w-14 text-right text-sm font-semibold tabular-nums">
                {item.portionGrams}g
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="tabular-nums">{Math.round(item.calories)}</span> kcal ·{" "}
              <span className="tabular-nums">{round1(item.proteinG)}</span>g P ·{" "}
              <span className="tabular-nums">{round1(item.carbsG)}</span>g C ·{" "}
              <span className="tabular-nums">{round1(item.fatG)}</span>g F
            </p>
          </div>
        </div>
      </Card>
    </li>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div>
      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums", accent)}>{value}</p>
    </div>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  if (value >= HIGH_CONF) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        High
      </span>
    );
  }
  if (value >= LOW_CONF) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
        OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Verify
    </span>
  );
}

function confidencePanelClass(c: number) {
  if (c >= HIGH_CONF) return "border-emerald-200 bg-emerald-50/50";
  if (c >= LOW_CONF) return "";
  return "border-amber-300 bg-amber-50/30";
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
