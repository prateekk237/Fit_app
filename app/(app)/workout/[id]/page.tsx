"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flag,
  Loader2,
  Activity,
  Flame,
  MoonStar,
  Move,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExerciseRunner, type RunnerExercise } from "@/components/workout/ExerciseRunner";
import { RestTimer } from "@/components/workout/RestTimer";
import { RpeSlider } from "@/components/workout/RpeSlider";
import type { SetEntry } from "@/components/workout/SetTracker";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface WorkoutDetail {
  id: number;
  dayNumber: number;
  name: string;
  category: string;
  durationMin: number;
  description: string | null;
  exercises: RunnerExercise[];
}

const CATEGORY: Record<
  string,
  { icon: LucideIcon; bg: string; fg: string; label: string }
> = {
  push: { icon: Dumbbell, bg: "bg-rose-500/10", fg: "text-rose-600", label: "Push" },
  pull: { icon: Dumbbell, bg: "bg-indigo-500/10", fg: "text-indigo-600", label: "Pull" },
  legs: { icon: Move, bg: "bg-amber-500/10", fg: "text-amber-600", label: "Legs" },
  hiit: { icon: Flame, bg: "bg-orange-500/10", fg: "text-orange-600", label: "HIIT" },
  fullbody: { icon: Activity, bg: "bg-emerald-500/10", fg: "text-emerald-600", label: "Full body" },
  cardio: { icon: Sun, bg: "bg-sky-500/10", fg: "text-sky-600", label: "Cardio" },
  rest: { icon: MoonStar, bg: "bg-muted", fg: "text-muted-foreground", label: "Rest" },
};

type SessionState = {
  startedAt: string;
  bySlug: Record<string, SetEntry[]>;
  skipped: Set<string>;
  expanded: string | null;
  restFor: { slug: string; seconds: number } | null;
};

async function fetchWorkout(id: string): Promise<WorkoutDetail> {
  const res = await fetch(`/api/workouts/${id}`);
  if (!res.ok) throw new Error("Failed to load workout");
  return res.json();
}

async function postLog(body: unknown) {
  const res = await fetch("/api/workout-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save log");
  return res.json();
}

export default function WorkoutRunnerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params?.id as string;

  const { data, isPending, error } = useQuery({
    queryKey: ["workout", id],
    queryFn: () => fetchWorkout(id),
    enabled: !!id,
  });

  const [session, setSession] = useState<SessionState | null>(null);
  const [rpe, setRpe] = useState<number>(7);
  const [finishing, setFinishing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: postLog,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
      qc.invalidateQueries({ queryKey: ["workouts", "all"] });
    },
  });

  // Initialize session on first data load.
  if (data && !session) {
    const bySlug: Record<string, SetEntry[]> = {};
    for (const ex of data.exercises) {
      bySlug[ex.slug] = Array.from({ length: Math.max(1, ex.sets) }, () => ({ completed: false }));
    }
    setSession({
      startedAt: new Date().toISOString(),
      bySlug,
      skipped: new Set(),
      expanded: data.exercises[0]?.slug ?? null,
      restFor: null,
    });
  }

  const progress = useMemo(() => {
    if (!data || !session) return { done: 0, total: 0 };
    let done = 0;
    let total = 0;
    for (const ex of data.exercises) {
      if (session.skipped.has(ex.slug)) continue;
      const sets = session.bySlug[ex.slug] ?? [];
      total += sets.length;
      done += sets.filter((s) => s.completed).length;
    }
    return { done, total };
  }, [data, session]);

  const allDone = progress.total > 0 && progress.done === progress.total;

  function setSets(slug: string, sets: SetEntry[]) {
    setSession((s) => (s ? { ...s, bySlug: { ...s.bySlug, [slug]: sets } } : s));
  }
  function toggleExpanded(slug: string) {
    setSession((s) =>
      s ? { ...s, expanded: s.expanded === slug ? null : slug } : s,
    );
  }
  function onCompleteSet(slug: string, restSec: number) {
    setSession((s) => (s ? { ...s, restFor: { slug, seconds: restSec } } : s));
  }
  function skipExercise(slug: string) {
    setSession((s) => {
      if (!s) return s;
      const next = new Set(s.skipped);
      next.add(slug);
      return { ...s, skipped: next };
    });
  }
  function dismissTimer() {
    setSession((s) => (s ? { ...s, restFor: null } : s));
  }

  async function handleFinish() {
    if (!data || !session) return;
    setFinishing(true);
    const completedAt = new Date().toISOString();
    const startedAt = session.startedAt;
    const durationMin = Math.max(
      1,
      Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000),
    );
    try {
      await saveMutation.mutateAsync({
        workoutId: data.id,
        startedAt,
        completedAt,
        durationMin,
        rpeOverall: rpe,
        exercises: data.exercises.map((ex) => ({
          slug: ex.slug,
          sets: session.bySlug[ex.slug] ?? [],
          skipped: session.skipped.has(ex.slug),
        })),
      });
      router.push("/workout?done=1");
      router.refresh();
    } catch (err) {
      setFinishing(false);
      toast({
        variant: "destructive",
        title: "Couldn't save workout",
        description: (err as Error).message,
      });
    }
  }

  if (isPending || !data || !session) {
    if (error) return <ErrorCard />;
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 rounded-lg" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  const meta = CATEGORY[data.category] ?? CATEGORY.fullbody!;
  const Icon = meta.icon;

  return (
    <div className="space-y-4 pb-32">
      {/* Sticky rest timer when active */}
      {session.restFor && (
        <div className="sticky top-0 z-40 -mx-4 bg-background/95 px-4 pb-2 pt-1 backdrop-blur">
          <RestTimer
            key={`${session.restFor.slug}-${session.restFor.seconds}`}
            seconds={session.restFor.seconds}
            onDone={() => {/* keep visible; user can dismiss */}}
            onDismiss={dismissTimer}
            autoStart
          />
        </div>
      )}

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            href="/workout"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Day {data.dayNumber} · {meta.label}
            </p>
            <h1 className="text-lg font-bold leading-tight">{data.name}</h1>
          </div>
        </div>
        <div className={cn("rounded-md p-2", meta.bg, meta.fg)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </header>

      {/* Progress strip */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">Session progress</p>
          <p className="text-sm font-semibold tabular-nums">
            {progress.done}/{progress.total} sets
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              allDone ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: progress.total === 0 ? "0%" : `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden />
          Target {data.durationMin} min
        </p>
      </Card>

      {data.description && (
        <p className="px-1 text-xs text-muted-foreground">{data.description}</p>
      )}

      <ul className="space-y-3">
        {data.exercises.map((ex) => (
          <li key={ex.slug}>
            <ExerciseRunner
              ex={ex}
              setsState={session.bySlug[ex.slug] ?? []}
              onSetsChange={(s) => setSets(ex.slug, s)}
              onCompleteSet={() => onCompleteSet(ex.slug, ex.rest_sec)}
              expanded={session.expanded === ex.slug}
              onToggle={() => toggleExpanded(ex.slug)}
              onSkip={() => skipExercise(ex.slug)}
              skipped={session.skipped.has(ex.slug)}
              isActive={session.expanded === ex.slug}
            />
          </li>
        ))}
      </ul>

      {/* Sticky finish panel */}
      <div className="fixed inset-x-0 bottom-[80px] z-30 mx-auto max-w-xl px-4 md:max-w-3xl">
        <Card className="space-y-3 border-primary/20 bg-background/95 p-3 shadow-lg backdrop-blur">
          <RpeSlider value={rpe} onChange={setRpe} />
          <Button
            size="lg"
            className="w-full"
            onClick={handleFinish}
            disabled={finishing || progress.done === 0}
          >
            {finishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Saving…
              </>
            ) : (
              <>
                <Flag className="mr-2 h-4 w-4" aria-hidden />
                {allDone ? "Finish workout" : `Finish early (${progress.done}/${progress.total})`}
              </>
            )}
          </Button>
          {allDone && (
            <p className="flex items-center justify-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3 w-3" aria-hidden /> All sets done — great job.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <Card className="p-4 text-sm text-destructive">
      Couldn&apos;t load this workout.
    </Card>
  );
}
