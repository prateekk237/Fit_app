"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, parseISO } from "date-fns";

interface Digest {
  generatedAt: string;
  provider: string;
  durationMs: number;
  weekStart: string;
  weekEnd: string;
  result: {
    headline?: string;
    insights: string[];
    recommendation: string;
    risk_flag?: string | null;
  };
}

async function fetchDigest(force = false): Promise<Digest> {
  const res = await fetch(`/api/insights/weekly${force ? "?force=1" : ""}`);
  if (!res.ok) throw new Error("Failed to load digest");
  return res.json();
}
async function regenDigest(): Promise<Digest> {
  const res = await fetch("/api/insights/weekly", { method: "POST" });
  if (!res.ok) throw new Error("Regeneration failed");
  return res.json();
}

export function WeeklyInsights() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["insights", "weekly"],
    queryFn: () => fetchDigest(false),
    staleTime: 60 * 60 * 1000,
  });

  const regen = useMutation({
    mutationFn: regenDigest,
    onSuccess: (d) => qc.setQueryData(["insights", "weekly"], d),
  });

  if (isPending) {
    return (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weekly insights
          </p>
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
      </Card>
    );
  }
  if (error || !data) return null;

  const { result } = data;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Weekly insights
            </p>
          </div>
          {result.headline && (
            <p className="mt-1 text-base font-semibold leading-snug">
              {result.headline}
            </p>
          )}
          <p className="mt-1 text-[0.65rem] text-muted-foreground">
            Week of {data.weekStart} → {data.weekEnd} · {data.provider} ·{" "}
            {formatDistanceToNow(parseISO(data.generatedAt), { addSuffix: true })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Regenerate"
          onClick={() => regen.mutate()}
          disabled={regen.isPending}
          className="shrink-0"
        >
          <RefreshCw
            className={`h-4 w-4 ${regen.isPending ? "animate-spin" : ""}`}
            aria-hidden
          />
        </Button>
      </div>

      {result.risk_flag && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{result.risk_flag}</p>
        </div>
      )}

      <ul className="space-y-2">
        {result.insights.slice(0, 6).map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-snug">
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-semibold">Next week: </span>
          {result.recommendation}
        </p>
      </div>
    </Card>
  );
}
