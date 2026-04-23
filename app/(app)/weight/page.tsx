"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Scale, Plus } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface WeightLog {
  id: string;
  loggedAt: string;
  logDate: string;
  weightKg: number;
  waistCm: number | null;
  chestCm: number | null;
  hipCm: number | null;
  bodyFatPct: number | null;
  notes: string | null;
}
interface WeightResponse {
  targetKg: number;
  startKg: number;
  logs: WeightLog[];
}

type Metric = "weight" | "waist" | "chest";

const METRIC_META: Record<
  Metric,
  { key: keyof WeightLog; unit: string; label: string; accent: string }
> = {
  weight: { key: "weightKg", unit: "kg", label: "Weight", accent: "#6366f1" },
  waist: { key: "waistCm", unit: "cm", label: "Waist", accent: "#f59e0b" },
  chest: { key: "chestCm", unit: "cm", label: "Chest", accent: "#10b981" },
};

async function fetchLogs(): Promise<WeightResponse> {
  const res = await fetch("/api/weight-logs");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function postLog(body: {
  weightKg: number;
  waistCm?: number;
  chestCm?: number;
  hipCm?: number;
  bodyFatPct?: number;
  notes?: string;
}) {
  const res = await fetch("/api/weight-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
  return res.json();
}

export default function WeightPage() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["weight-logs"],
    queryFn: fetchLogs,
  });

  const [metric, setMetric] = useState<Metric>("weight");
  const [range, setRange] = useState<"4w" | "12w" | "all">("12w");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    weightKg: "",
    waistCm: "",
    chestCm: "",
    hipCm: "",
    bodyFatPct: "",
    notes: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: postLog,
    onSuccess: () => {
      setShowForm(false);
      setFormError(null);
      setForm({ weightKg: "", waistCm: "", chestCm: "", hipCm: "", bodyFatPct: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["weight-logs"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    },
    onError: (err) => setFormError((err as Error).message),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    const cutoff = (() => {
      const d = new Date();
      if (range === "4w") d.setDate(d.getDate() - 28);
      else if (range === "12w") d.setDate(d.getDate() - 84);
      else return null;
      return d;
    })();

    const meta = METRIC_META[metric];
    const filtered = data.logs
      .map((l) => ({
        date: l.logDate,
        value: l[meta.key] as number | null,
      }))
      .filter((d) => d.value != null)
      .filter((d) => !cutoff || new Date(d.date) >= cutoff);

    // 7-day moving average.
    const withMA = filtered.map((row, i) => {
      const window = filtered
        .slice(Math.max(0, i - 6), i + 1)
        .map((r) => r.value as number);
      const ma = window.reduce((a, b) => a + b, 0) / window.length;
      return { ...row, ma: Math.round(ma * 10) / 10 };
    });
    return withMA;
  }, [data, metric, range]);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (error || !data) {
    return <Card className="p-4 text-sm text-destructive">Failed to load weights.</Card>;
  }

  const latest = data.logs[data.logs.length - 1];
  const meta = METRIC_META[metric];
  const latestValue = latest ? (latest[meta.key] as number | null) : null;
  const firstValue = data.logs.length > 0 ? (data.logs[0]?.[meta.key] as number | null) : null;
  const delta = latestValue != null && firstValue != null ? latestValue - firstValue : null;

  function submit() {
    setFormError(null);
    const weight = Number(form.weightKg);
    if (!Number.isFinite(weight) || weight < 30 || weight > 400) {
      setFormError("Enter a valid weight (30–400 kg)");
      return;
    }
    const body: Parameters<typeof postLog>[0] = { weightKg: weight };
    if (form.waistCm) body.waistCm = Number(form.waistCm);
    if (form.chestCm) body.chestCm = Number(form.chestCm);
    if (form.hipCm) body.hipCm = Number(form.hipCm);
    if (form.bodyFatPct) body.bodyFatPct = Number(form.bodyFatPct);
    if (form.notes) body.notes = form.notes;
    saveMutation.mutate(body);
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Weight</h1>
          <p className="text-sm text-muted-foreground">
            Log weekly on Sunday morning — same time, pre-breakfast.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} size="sm">
          {showForm ? "Cancel" : <><Plus className="mr-1 h-4 w-4" /> Log</>}
        </Button>
      </div>

      {showForm && (
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight (kg)" value={form.weightKg} onChange={(v) => setForm({ ...form, weightKg: v })} required />
            <Field label="Body fat %" value={form.bodyFatPct} onChange={(v) => setForm({ ...form, bodyFatPct: v })} />
            <Field label="Waist (cm)" value={form.waistCm} onChange={(v) => setForm({ ...form, waistCm: v })} />
            <Field label="Chest (cm)" value={form.chestCm} onChange={(v) => setForm({ ...form, chestCm: v })} />
            <Field label="Hip (cm)" value={form.hipCm} onChange={(v) => setForm({ ...form, hipCm: v })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. post-cheat day"
              className="mt-1"
            />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button
            className="w-full"
            onClick={submit}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save log"}
          </Button>
        </Card>
      )}

      {/* Summary stats */}
      <Card className="p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {meta.label}
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums" style={{ color: meta.accent }}>
              {latestValue != null ? latestValue.toFixed(1) : "—"}
              <span className="ml-1 text-base font-medium text-muted-foreground">
                {meta.unit}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {delta != null ? (
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    delta < 0 ? "text-emerald-600" : delta > 0 ? "text-rose-600" : "",
                  )}
                >
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)} {meta.unit}
                </span>
              ) : (
                <span>no previous log</span>
              )}
              {metric === "weight" && data.targetKg > 0 && ` · target ${data.targetKg} kg`}
            </p>
          </div>
          <Scale className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
      </Card>

      {/* Tabs + range */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList>
            <TabsTrigger value="weight">Weight</TabsTrigger>
            <TabsTrigger value="waist">Waist</TabsTrigger>
            <TabsTrigger value="chest">Chest</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="inline-flex rounded-full border bg-muted p-0.5 text-xs">
          {(["4w", "12w", "all"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors",
                range === r
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <Card className="p-4">
        <div className="h-64 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No {meta.label.toLowerCase()} logs in this range yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                <defs>
                  <linearGradient id="weight-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={meta.accent} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={meta.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => {
                    const x = new Date(`${d}T00:00:00Z`);
                    return x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                  tick={{ fontSize: 10 }}
                  minTickGap={30}
                />
                <YAxis
                  domain={([min, max]) => [Math.floor(min - 1), Math.ceil(max + 1)]}
                  tick={{ fontSize: 10 }}
                  width={32}
                />
                <Tooltip
                  formatter={(v: number) => [`${v} ${meta.unit}`, ""]}
                  labelFormatter={(d) => new Date(`${d}T00:00:00Z`).toDateString()}
                />
                {metric === "weight" && data.targetKg > 0 && (
                  <ReferenceLine
                    y={data.targetKg}
                    stroke="#10b981"
                    strokeDasharray="4 3"
                    label={{ value: `target ${data.targetKg}`, fill: "#10b981", fontSize: 10, position: "insideTopRight" }}
                  />
                )}
                <Area type="monotone" dataKey="value" stroke={meta.accent} strokeWidth={2} fill="url(#weight-area)" isAnimationActive={false} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="ma" stroke={meta.accent} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                <Legend
                  payload={[
                    { value: meta.label, type: "line", id: "v", color: meta.accent },
                    { value: "7-day avg", type: "line", id: "ma", color: meta.accent },
                  ]}
                  wrapperStyle={{ fontSize: "0.7rem" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Log history */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Log history ({data.logs.length})
        </h2>
        {data.logs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No weight logs yet — tap Log to record your first.
          </Card>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {[...data.logs].reverse().slice(0, 10).map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold tabular-nums">
                    {l.weightKg.toFixed(1)} kg
                    {l.waistCm != null && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        waist {l.waistCm} cm
                      </span>
                    )}
                    {l.bodyFatPct != null && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        BF {l.bodyFatPct}%
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {l.logDate}
                    {l.notes && <span className="ml-2 italic">“{l.notes}”</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        type="number"
        step="0.1"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 tabular-nums"
      />
    </div>
  );
}
