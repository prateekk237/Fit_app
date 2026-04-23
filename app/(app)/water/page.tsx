"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Droplet, Plus, Undo2, Coffee, GlassWater } from "lucide-react";
import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WaterResponse {
  date: string;
  totalMl: number;
  targetMl: number;
  logs: Array<{ id: string; loggedAt: string; amountMl: number }>;
}

const STEP_ML = 250;

async function fetchWater(): Promise<WaterResponse> {
  const res = await fetch("/api/water-logs");
  if (!res.ok) throw new Error("Failed to load water logs");
  return res.json();
}
async function addWater(amountMl: number) {
  const res = await fetch("/api/water-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountMl }),
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}
async function deleteLog(id: string) {
  const res = await fetch(`/api/water-logs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed");
}

export default function WaterPage() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["water-logs", "today"],
    queryFn: fetchWater,
  });

  const addMutation = useMutation({
    mutationFn: addWater,
    onSuccess: () => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(15);
      qc.invalidateQueries({ queryKey: ["water-logs", "today"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    },
  });
  const delMutation = useMutation({
    mutationFn: deleteLog,
    onSuccess: () => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(25);
      qc.invalidateQueries({ queryKey: ["water-logs", "today"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    },
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (error || !data) {
    return <Card className="p-4 text-sm text-destructive">Failed to load water logs.</Card>;
  }

  const slots = Math.max(1, Math.ceil(data.targetMl / STEP_ML));
  const filled = Math.min(slots, Math.round(data.totalMl / STEP_ML));
  const percent = Math.min(100, (data.totalMl / data.targetMl) * 100);
  const remainingMl = Math.max(0, data.targetMl - data.totalMl);
  const latestLog = data.logs[data.logs.length - 1];

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Water</h1>
        <p className="text-sm text-muted-foreground">
          Tap a droplet to log 250 ml — long-press the latest to undo.
        </p>
      </div>

      {/* Summary ring + target */}
      <Card className="p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Today
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-sky-600">
              {(data.totalMl / 1000).toFixed(2)}
              <span className="ml-1 text-base font-medium text-muted-foreground">L</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {remainingMl === 0 ? "Target reached 🎉" : `${remainingMl.toLocaleString()} ml to go`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground tabular-nums">
              target {(data.targetMl / 1000).toFixed(2)} L
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-sky-600">
              {Math.round(percent)}%
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/30">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-sky-600 transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </Card>

      {/* Droplet grid */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">
            {filled}/{slots} droplets
          </p>
          {latestLog && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => delMutation.mutate(latestLog.id)}
              disabled={delMutation.isPending}
              aria-label="Undo last log"
              className="text-muted-foreground"
            >
              <Undo2 className="mr-1 h-4 w-4" /> Undo last
            </Button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {Array.from({ length: slots }).map((_, i) => (
            <DropletButton
              key={i}
              filled={i < filled}
              isLatest={i === filled - 1}
              onTap={() => {
                if (i < filled) {
                  // Tap an already-filled droplet → undo latest log.
                  if (latestLog) delMutation.mutate(latestLog.id);
                } else {
                  addMutation.mutate(STEP_ML);
                }
              }}
              onLongPress={() => {
                if (i < filled && latestLog) delMutation.mutate(latestLog.id);
              }}
            />
          ))}
        </div>
      </Card>

      {/* Quick add buttons */}
      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quick add
        </p>
        <div className="grid grid-cols-4 gap-2">
          <QuickAdd ml={250} onClick={() => addMutation.mutate(250)} Icon={GlassWater} label="Glass" />
          <QuickAdd ml={500} onClick={() => addMutation.mutate(500)} Icon={Droplet} label="Bottle" />
          <QuickAdd ml={750} onClick={() => addMutation.mutate(750)} Icon={Droplet} label="Big" />
          <QuickAdd ml={200} onClick={() => addMutation.mutate(200)} Icon={Coffee} label="Tea" />
        </div>
      </Card>

      {/* History */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Log history ({data.logs.length})
        </h2>
        {data.logs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No water logged yet today.
          </Card>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {[...data.logs].reverse().map((l) => (
              <li key={l.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <Droplet className="h-4 w-4 text-sky-500" aria-hidden />
                  <span className="text-sm font-semibold tabular-nums">{l.amountMl} ml</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(l.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => delMutation.mutate(l.id)}
                  disabled={delMutation.isPending}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DropletButton({
  filled,
  isLatest,
  onTap,
  onLongPress,
}: {
  filled: boolean;
  isLatest: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const start = useCallback(() => {
    setPressed(true);
    timer = setTimeout(() => {
      if (filled) onLongPress();
      setPressed(false);
      timer = null;
    }, 450);
  }, [filled, onLongPress]);
  const clear = useCallback(() => {
    setPressed(false);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }, []);

  return (
    <button
      type="button"
      onClick={onTap}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      className={cn(
        "relative flex h-14 items-center justify-center rounded-lg border text-sm font-semibold transition-all",
        filled
          ? "border-sky-500 bg-sky-500 text-white shadow-sm shadow-sky-500/30"
          : "border-dashed border-muted-foreground/30 bg-muted text-muted-foreground hover:border-sky-500 hover:text-sky-500",
        isLatest && "ring-2 ring-sky-300",
        pressed && "scale-95",
      )}
      aria-label={filled ? "Filled droplet (long-press to undo)" : "Empty droplet (tap to fill)"}
    >
      <Droplet className="h-5 w-5" aria-hidden />
    </button>
  );
}

function QuickAdd({
  ml,
  onClick,
  Icon,
  label,
}: {
  ml: number;
  onClick: () => void;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border bg-card px-2 py-3 text-xs font-medium transition-colors",
        "hover:bg-sky-50 hover:border-sky-300 dark:hover:bg-sky-950/30",
      )}
    >
      <Icon className="h-5 w-5 text-sky-500" aria-hidden />
      <span className="tabular-nums">+{ml}</span>
      <span className="text-[0.6rem] text-muted-foreground">{label}</span>
      <Plus className="absolute h-0 w-0 opacity-0" aria-hidden />
    </button>
  );
}
