"use client";

import { cn } from "@/lib/utils";

interface Props {
  consumed: number;
  target: number;
  size?: number;
  strokeWidth?: number;
}

export function CalorieRing({ consumed, target, size = 220, strokeWidth = 18 }: Props) {
  const safeTarget = target > 0 ? target : 1900;
  const percent = Math.min(100, Math.max(0, (consumed / safeTarget) * 100));
  const remaining = Math.max(0, safeTarget - consumed);
  const over = consumed > safeTarget;
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const dashOffset = circ * (1 - percent / 100);

  // Color logic: <85% green, 85-100% amber, >100% red.
  const stateColor = over
    ? "stroke-[url(#fit-over)]"
    : percent >= 85
    ? "stroke-[url(#fit-warn)]"
    : "stroke-[url(#fit-ok)]";

  const labelTop = over ? "Over" : "Remaining";
  const labelValue = over ? consumed - safeTarget : remaining;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(consumed)} of ${safeTarget} calories consumed`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id="fit-ok" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="fit-warn" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="fit-over" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-muted"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out", stateColor)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[2.6rem] font-bold leading-none tracking-tight tabular-nums">
          {Math.round(consumed).toLocaleString()}
        </div>
        <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">kcal eaten</div>
        <div className="mt-4 flex items-center gap-1 text-sm">
          <span
            className={cn(
              "font-semibold tabular-nums",
              over ? "text-destructive" : "text-foreground",
            )}
          >
            {Math.round(labelValue).toLocaleString()}
          </span>
          <span className="text-muted-foreground">{labelTop.toLowerCase()}</span>
        </div>
        <div className="mt-1 text-[0.7rem] text-muted-foreground">
          target {safeTarget.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
