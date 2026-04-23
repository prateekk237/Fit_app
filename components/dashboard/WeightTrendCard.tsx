"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, ReferenceLine, YAxis } from "recharts";

interface Props {
  currentKg: number;
  targetKg: number;
  startKg: number;
  sevenDayAvgKg: number | null;
  lastLoggedDate: string | null;
  sparkline: { date: string; kg: number }[];
}

export function WeightTrendCard({
  currentKg,
  targetKg,
  startKg,
  sevenDayAvgKg,
  lastLoggedDate,
  sparkline,
}: Props) {
  const loss = Math.max(0, startKg - currentKg);
  const remaining = Math.max(0, currentKg - targetKg);
  const progressPct =
    startKg > targetKg
      ? Math.min(100, Math.max(0, ((startKg - currentKg) / (startKg - targetKg)) * 100))
      : 0;

  const data = useMemo(() => {
    if (sparkline.length >= 2) return sparkline;
    // Fake a flat line so the chart area doesn't collapse.
    return [
      { date: "start", kg: currentKg },
      { date: "now", kg: currentKg },
    ];
  }, [sparkline, currentKg]);

  const yDomain: [number, number] = useMemo(() => {
    const values = data.map((d) => d.kg);
    const min = Math.min(...values, targetKg);
    const max = Math.max(...values, startKg);
    return [Math.floor(min) - 0.5, Math.ceil(max) + 0.5];
  }, [data, targetKg, startKg]);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weight trend
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{currentKg.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">kg</span>
            {loss > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <TrendingDown className="h-3 w-3" aria-hidden />
                -{loss.toFixed(1)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {sevenDayAvgKg != null
              ? `7-day avg ${sevenDayAvgKg.toFixed(1)} kg · `
              : ""}
            {lastLoggedDate ? `last logged ${lastLoggedDate}` : "no logs yet"}
          </p>
        </div>
        <Link
          href="/weight"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Log <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-3 h-20 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={yDomain} />
            <ReferenceLine
              y={targetKg}
              stroke="#10b981"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="kg"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#weight-fill)"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center justify-between text-[0.7rem] text-muted-foreground">
        <span className="tabular-nums">start {startKg.toFixed(1)}</span>
        <span className="tabular-nums">target {targetKg.toFixed(1)}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-700 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[0.7rem] text-muted-foreground tabular-nums">
        {remaining > 0 ? `${remaining.toFixed(1)} kg to target` : "🎯 target reached"}
      </p>
    </Card>
  );
}
