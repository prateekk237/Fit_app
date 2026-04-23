"use client";

import Image from "next/image";
import { ChevronDown, ChevronRight, Info, SkipForward, Youtube } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SetTracker, type SetEntry } from "./SetTracker";

export interface RunnerExercise {
  order: number;
  slug: string;
  sets: number;
  reps: string | number;
  rest_sec: number;
  exercise: {
    name: string;
    category: string;
    muscleGroups: string[];
    equipmentNeeded: string[];
    difficulty: string | null;
    imageUrl: string | null;
    youtubeId: string | null;
    attribution: string | null;
    instructions: string;
    formCue: string | null;
    commonMistakes: string | null;
  } | null;
}

interface Props {
  ex: RunnerExercise;
  setsState: SetEntry[];
  onSetsChange: (sets: SetEntry[]) => void;
  onCompleteSet: (index: number) => void;
  expanded: boolean;
  onToggle: () => void;
  onSkip: () => void;
  skipped: boolean;
  isActive?: boolean;
}

export function ExerciseRunner({
  ex,
  setsState,
  onSetsChange,
  onCompleteSet,
  expanded,
  onToggle,
  onSkip,
  skipped,
  isActive,
}: Props) {
  const completedSets = setsState.filter((s) => s.completed).length;
  const totalSets = setsState.length;
  const meta = ex.exercise;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors",
        isActive && "ring-2 ring-primary/50",
        skipped && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40"
        aria-expanded={expanded}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold tabular-nums text-primary">
          {ex.order + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold capitalize">
            {meta?.name ?? ex.slug}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="tabular-nums">{ex.sets}</span> × {String(ex.reps)} ·{" "}
            <span className="tabular-nums">{ex.rest_sec}s</span> rest
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!skipped && totalSets > 0 && (
            <Badge
              variant="secondary"
              className={cn(
                "tabular-nums",
                completedSets === totalSets && "bg-emerald-600 text-white",
              )}
            >
              {completedSets}/{totalSets}
            </Badge>
          )}
          {skipped && <Badge variant="outline">Skipped</Badge>}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t p-4">
          {/* Demo: image or YouTube iframe */}
          <div className="overflow-hidden rounded-md border bg-muted">
            {meta?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.imageUrl}
                alt={meta.name}
                className="mx-auto max-h-56 w-full object-contain"
              />
            ) : meta?.youtubeId ? (
              <div className="aspect-video">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${meta.youtubeId}?rel=0&modestbranding=1`}
                  title={meta.name}
                  className="h-full w-full"
                  loading="lazy"
                  allowFullScreen
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                <Info className="mr-1 h-4 w-4" aria-hidden /> No demo available
              </div>
            )}
          </div>

          {meta && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{meta.instructions}</p>
              {meta.formCue && (
                <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  <span className="font-semibold text-primary">Form cue — </span>
                  {meta.formCue}
                </p>
              )}
              {meta.commonMistakes && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
                  <span className="font-semibold">Watch out — </span>
                  {meta.commonMistakes}
                </p>
              )}
              {(meta.muscleGroups.length > 0 || meta.equipmentNeeded.length > 0) && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {meta.muscleGroups.map((m) => (
                    <Badge key={m} variant="outline" className="text-[0.6rem]">{m}</Badge>
                  ))}
                  {meta.equipmentNeeded.map((e) => (
                    <Badge key={e} variant="secondary" className="text-[0.6rem]">{e}</Badge>
                  ))}
                </div>
              )}
              {meta.youtubeId && meta.imageUrl && (
                <a
                  href={`https://www.youtube-nocookie.com/embed/${meta.youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-primary hover:underline"
                >
                  <Youtube className="h-3 w-3" aria-hidden /> Watch video
                </a>
              )}
            </div>
          )}

          <SetTracker
            sets={setsState}
            targetReps={ex.reps}
            onChange={onSetsChange}
            onCompleteSet={onCompleteSet}
          />

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={onSkip} disabled={skipped}>
              <SkipForward className="mr-1 h-4 w-4" /> Skip exercise
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
