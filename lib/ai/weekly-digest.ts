/**
 * Weekly AI digest. Aggregates the user's last 7 local days of signals,
 * shapes a compact prompt, and asks the text model (Llama-3.3-70B on
 * NVIDIA NIM by default, Groq/Gemini fallbacks, mock when no keys set)
 * for a JSON digest the dashboard can render.
 */
import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getLocalDate, getLocalDateUTC } from "@/lib/time";
import { computeStreak } from "@/lib/streak";

export const digestZod = z.object({
  insights: z.array(z.string().min(5).max(240)).min(1).max(8),
  recommendation: z.string().min(10).max(400),
  risk_flag: z.string().max(400).nullable().optional(),
  headline: z.string().min(3).max(80).optional(),
});
export type DigestResult = z.infer<typeof digestZod>;

const digestJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    insights: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
    risk_flag: { type: ["string", "null"] },
    headline: { type: "string" },
  },
  required: ["insights", "recommendation"],
} as const;

const SYSTEM_PROMPT = `You are an Indian fitness & nutrition coach writing a weekly digest
for Prateek (92 kg → 80 kg, desk job, 6-day home workout split).

Write observations grounded ONLY in the JSON stats provided. Do NOT
invent facts. Flag risk (rapid loss, muscle loss, protein deficit 3+
days) in risk_flag ONLY if the data shows it. Keep each insight to
one sentence. Use "you" voice. Avoid meaningless platitudes.

Output valid JSON matching the schema:
{
  "headline": "1 short line (≤ 60 chars)",
  "insights": ["4-6 bullet points, one observation each"],
  "recommendation": "one concrete action for next week",
  "risk_flag": null or "one short sentence"
}
Output ONLY the JSON. No markdown, no prose outside the object.`;

export interface WeekStats {
  user: { name: string; timezone: string; dietPreference: string };
  weekStart: string; // YYYY-MM-DD local
  weekEnd: string;
  targets: {
    calories: number;
    proteinG: number;
    waterMl: number;
  };
  days: Array<{
    date: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    waterMl: number;
    workoutDone: boolean;
    workoutCategory: string | null;
    rpe: number | null;
    weightKg: number | null;
  }>;
  weekAvgCalories: number;
  weekAvgProteinG: number;
  daysLogged: number;
  daysOnProtein: number; // within 85-115% of target
  workoutsCompleted: number;
  weightDelta: number | null; // first-logged vs last-logged
  currentStreak: number;
}

export async function gatherWeekStats(userId: string): Promise<WeekStats> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const today = getLocalDateUTC(user.timezone);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 6);
  const weekStart = start.toISOString().slice(0, 10);
  const weekEnd = today.toISOString().slice(0, 10);

  const [foodRows, waterRows, workoutRows, weightRows] = await Promise.all([
    prisma.foodLog.groupBy({
      by: ["logDate"],
      where: { userId, logDate: { gte: start, lte: today } },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
    prisma.waterLog.groupBy({
      by: ["logDate"],
      where: { userId, logDate: { gte: start, lte: today } },
      _sum: { amountMl: true },
    }),
    prisma.workoutLog.findMany({
      where: {
        userId,
        logDate: { gte: start, lte: today },
        completedAt: { not: null },
      },
      include: { workout: { select: { category: true } } },
    }),
    prisma.weightLog.findMany({
      where: { userId, logDate: { gte: start, lte: today } },
      orderBy: { logDate: "asc" },
    }),
  ]);

  const foodByDate = new Map(foodRows.map((r) => [asDate(r.logDate), r]));
  const waterByDate = new Map(waterRows.map((r) => [asDate(r.logDate), r]));
  const workoutByDate = new Map<string, { category: string | null; rpe: number | null }>();
  for (const w of workoutRows) {
    workoutByDate.set(asDate(w.logDate), {
      category: w.workout?.category ?? null,
      rpe: w.rpeOverall,
    });
  }
  const weightByDate = new Map(weightRows.map((r) => [asDate(r.logDate), Number(r.weightKg)]));

  const days: WeekStats["days"] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const f = foodByDate.get(key);
    const w = waterByDate.get(key);
    const wk = workoutByDate.get(key);
    days.push({
      date: key,
      calories: f?._sum.calories ? Math.round(Number(f._sum.calories)) : 0,
      proteinG: f?._sum.proteinG ? round1(Number(f._sum.proteinG)) : 0,
      carbsG: f?._sum.carbsG ? round1(Number(f._sum.carbsG)) : 0,
      fatG: f?._sum.fatG ? round1(Number(f._sum.fatG)) : 0,
      waterMl: w?._sum.amountMl ?? 0,
      workoutDone: !!wk,
      workoutCategory: wk?.category ?? null,
      rpe: wk?.rpe ?? null,
      weightKg: weightByDate.get(key) ?? null,
    });
  }

  const daysLogged = days.filter((d) => d.calories > 0).length;
  const daysOnProtein = days.filter((d) => {
    const pct = user.dailyProteinTargetG > 0
      ? d.proteinG / user.dailyProteinTargetG
      : 0;
    return pct >= 0.85 && pct <= 1.15;
  }).length;
  const workoutsCompleted = days.filter((d) => d.workoutDone).length;

  const weightDelta =
    weightRows.length >= 2
      ? Number(weightRows[weightRows.length - 1]!.weightKg) -
        Number(weightRows[0]!.weightKg)
      : null;

  const avgC = days.reduce((a, b) => a + b.calories, 0) / Math.max(1, daysLogged || 1);
  const avgP = days.reduce((a, b) => a + b.proteinG, 0) / Math.max(1, daysLogged || 1);

  const currentStreak = await computeStreak(userId, getLocalDate(user.timezone));

  return {
    user: {
      name: user.name,
      timezone: user.timezone,
      dietPreference: user.dietPreference,
    },
    weekStart,
    weekEnd,
    targets: {
      calories: user.dailyCalorieTarget,
      proteinG: user.dailyProteinTargetG,
      waterMl: user.dailyWaterTargetMl,
    },
    days,
    weekAvgCalories: Math.round(avgC),
    weekAvgProteinG: round1(avgP),
    daysLogged,
    daysOnProtein,
    workoutsCompleted,
    weightDelta: weightDelta != null ? round1(weightDelta) : null,
    currentStreak,
  };
}

function asDate(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString().slice(0, 10);
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// -----------------------------------------------------------------------------
// Provider chain
// -----------------------------------------------------------------------------

type Provider = {
  name: string;
  available: () => boolean;
  call: (userPrompt: string) => Promise<string>;
};

const PROVIDERS: Provider[] = [
  {
    name: "nvidia-nim",
    available: () => !!process.env.NVIDIA_API_KEY,
    call: async (prompt) => {
      const c = new OpenAI({
        apiKey: process.env.NVIDIA_API_KEY!,
        baseURL: "https://integrate.api.nvidia.com/v1",
        timeout: 30_000,
      });
      const resp = await c.chat.completions.create({
        model: "meta/llama-3.3-70b-instruct",
        temperature: 0.2,
        max_tokens: 900,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "WeeklyDigest",
            schema: digestJsonSchema as unknown as Record<string, unknown>,
            strict: true,
          },
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });
      return resp.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    name: "groq",
    available: () => !!process.env.GROQ_API_KEY,
    call: async (prompt) => {
      const c = new OpenAI({
        apiKey: process.env.GROQ_API_KEY!,
        baseURL: "https://api.groq.com/openai/v1",
        timeout: 30_000,
      });
      const resp = await c.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });
      return resp.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    name: "gemini",
    available: () => !!process.env.GEMINI_API_KEY,
    call: async (prompt) => {
      const c = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY!,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        timeout: 30_000,
      });
      const resp = await c.chat.completions.create({
        model: "gemini-2.5-flash",
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });
      return resp.choices?.[0]?.message?.content ?? "";
    },
  },
];

export interface WeeklyDigestOutcome {
  provider: string;
  durationMs: number;
  result: DigestResult;
  stats: WeekStats;
}

export async function generateWeeklyDigest(userId: string): Promise<WeeklyDigestOutcome> {
  const started = Date.now();
  const stats = await gatherWeekStats(userId);
  const userPrompt = JSON.stringify(stats, null, 2);

  const active = PROVIDERS.filter((p) => p.available());
  if (active.length === 0) {
    const result = mockDigest(stats);
    return { provider: "mock", durationMs: Date.now() - started, result, stats };
  }

  const errors: string[] = [];
  for (const p of active) {
    try {
      const raw = await p.call(userPrompt);
      if (!raw) throw new Error("empty response");
      const parsed = digestZod.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new Error("schema invalid");
      return {
        provider: p.name,
        durationMs: Date.now() - started,
        result: parsed.data,
        stats,
      };
    } catch (err) {
      errors.push(`${p.name}:${(err as Error).message}`);
    }
  }

  // All providers failed — degrade gracefully.
  const result = mockDigest(stats);
  return {
    provider: `mock:${errors.join("|")}`,
    durationMs: Date.now() - started,
    result,
    stats,
  };
}

export function mockDigest(s: WeekStats): DigestResult {
  const insights: string[] = [];
  insights.push(
    `Logged food on ${s.daysLogged} of 7 days; average intake ${s.weekAvgCalories} kcal vs target ${s.targets.calories}.`,
  );
  insights.push(
    `Protein averaged ${s.weekAvgProteinG}g (${Math.round(
      (s.weekAvgProteinG / Math.max(1, s.targets.proteinG)) * 100,
    )}% of target); on-target ${s.daysOnProtein} of 7 days.`,
  );
  insights.push(
    `Workouts completed: ${s.workoutsCompleted} of 6 planned · current streak ${s.currentStreak} days.`,
  );
  if (s.weightDelta != null) {
    insights.push(
      `Weight ${s.weightDelta > 0 ? "up" : s.weightDelta < 0 ? "down" : "flat"} ${Math.abs(s.weightDelta)} kg across logged days.`,
    );
  }

  let recommendation = "Hold the plan — keep protein ≥ 160 g and one more workout next week.";
  if (s.daysOnProtein < 4) {
    recommendation =
      "Prioritise protein: add a 30 g source (eggs / paneer / chicken) at breakfast AND dinner.";
  } else if (s.workoutsCompleted < 4) {
    recommendation =
      "Move scheduled workouts to mornings to protect them from work slipping in.";
  } else if (s.daysLogged < 5) {
    recommendation =
      "Log on your commute or straight after meals — consistency > perfection this week.";
  }

  let risk: string | null = null;
  if (s.weightDelta != null && s.weightDelta < -1.2) {
    risk = "Losing > 1.2 kg this week — hold kcal steady for 3 days to protect muscle.";
  } else if (s.weekAvgProteinG < 0.6 * s.targets.proteinG && s.daysLogged >= 3) {
    risk = "Protein is tracking < 60% of target — muscle loss risk if this persists.";
  }

  return {
    headline:
      s.daysOnProtein >= 5 && s.workoutsCompleted >= 4
        ? "Solid consistency this week"
        : "Plenty of room to tighten this week",
    insights,
    recommendation,
    risk_flag: risk,
  };
}
