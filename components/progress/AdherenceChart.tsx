"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Row {
  date: string;
  calories: number;
  proteinG: number;
  calorieAdherence: number;
  proteinAdherence: number;
}

interface Props {
  rows: Row[];
  metric: "calorie" | "protein";
  target: number;
}

/**
 * 14-bar daily adherence chart. Bars colour-code by vs-target band:
 *   green  = within 85-115%
 *   amber  = 60-85% or 115-135%
 *   rose   = otherwise (way off target)
 * Thin 100% reference line overlays.
 */
export function AdherenceChart({ rows, metric, target }: Props) {
  const data = rows.map((r) => {
    const adherence = metric === "calorie" ? r.calorieAdherence : r.proteinAdherence;
    const raw = metric === "calorie" ? r.calories : r.proteinG;
    return {
      date: r.date.slice(5), // MM-DD
      iso: r.date,
      adherence,
      raw: Math.round(raw),
    };
  });

  function colorFor(pct: number): string {
    if (pct >= 85 && pct <= 115) return "#10b981"; // emerald
    if ((pct >= 60 && pct < 85) || (pct > 115 && pct <= 135)) return "#f59e0b"; // amber
    if (pct === 0) return "rgba(0,0,0,0.15)"; // empty day
    return "#f43f5e"; // rose — way off
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={32} unit="%" domain={[0, 150]} />
          <ReferenceLine y={100} stroke="#6366f1" strokeDasharray="3 3" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            formatter={(v, _k, item) => {
              const payload = item?.payload as { raw?: number } | undefined;
              const raw = payload?.raw ?? 0;
              return [
                `${v}% · ${raw}${metric === "calorie" ? " kcal" : "g P"}`,
                "Adherence",
              ];
            }}
            labelFormatter={(_d, items) => {
              const first = Array.isArray(items) ? items[0] : undefined;
              const payload = (first?.payload ?? {}) as { iso?: string };
              return payload.iso ?? "";
            }}
          />
          <Bar dataKey="adherence" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(d.adherence)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-right text-[0.65rem] text-muted-foreground">
        target {metric === "calorie" ? `${target.toLocaleString()} kcal` : `${target}g P`} / day
      </p>
    </div>
  );
}
