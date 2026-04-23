"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  days: number;
}

export function StreakBadge({ days }: Props) {
  const active = days > 0;
  const milestone = days >= 60 ? "🏆" : days >= 30 ? "⭐" : days >= 14 ? "✨" : null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
        active
          ? "border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-400"
          : "border-border bg-muted text-muted-foreground",
      )}
      aria-label={active ? `${days} day streak` : "No active streak"}
    >
      <Flame
        className={cn("h-3.5 w-3.5", active && "fill-orange-400 stroke-orange-500")}
        aria-hidden
      />
      <span className="tabular-nums">{days}</span>
      <span className="hidden sm:inline">day{days === 1 ? "" : "s"}</span>
      {milestone && <span aria-hidden>{milestone}</span>}
    </div>
  );
}
