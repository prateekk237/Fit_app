/**
 * Public analyser. Tries NIM → Groq → Gemini with a TIGHT per-provider
 * timeout so we stay under Vercel Hobby's 10s function budget. Failure
 * (timeout, 429, 5xx, schema mismatch) cascades immediately to the next
 * provider — no in-provider backoff. Mock fallback when no key is set.
 *
 * Time budget per provider (must sum to < 10s including a safety pad):
 *   NIM Maverick   8s
 *   Groq Scout     7s
 *   Gemini Flash   6s
 * Worst case: NIM timeout (8s) → Groq still has 1.8s left in budget.
 */
import { PROVIDERS, isRetryable, type ProviderName } from "./providers";
import { foodAnalysisZod, type FoodAnalysis } from "./schema";

export interface AnalyzeOutcome {
  result: FoodAnalysis;
  provider: ProviderName;
  attempts: Array<{ provider: ProviderName; error?: string }>;
  durationMs: number;
}

const TIMEOUTS_MS: Partial<Record<ProviderName, number>> = {
  "nvidia-nim": 8000,
  groq: 7000,
  gemini: 6000,
  openrouter: 6000,
  mock: 1000,
};

export async function analyzeFoodPhoto(buffer: Buffer): Promise<AnalyzeOutcome> {
  const started = Date.now();
  const attempts: AnalyzeOutcome["attempts"] = [];

  const active = PROVIDERS.filter((p) => p.available());

  if (active.length === 0) {
    const mock = mockAnalysis();
    attempts.push({ provider: "mock" });
    return {
      result: mock,
      provider: "mock",
      attempts,
      durationMs: Date.now() - started,
    };
  }

  for (const provider of active) {
    const budget = TIMEOUTS_MS[provider.name] ?? 6000;
    try {
      const result = await callWithTimeout(() => provider.analyze(buffer), budget);
      attempts.push({ provider: provider.name });
      return { result, provider: provider.name, attempts, durationMs: Date.now() - started };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      attempts.push({ provider: provider.name, error: message });
      // Cascade on timeout / retryable / schema errors. Bubble auth/quota
      // failures unchanged so the caller can surface them properly.
      if (
        !isRetryable(err) &&
        !/schema|JSON|Empty AI|timeout/i.test(message)
      ) {
        break;
      }
    }
  }

  throw Object.assign(new Error("All AI providers exhausted"), {
    status: 503,
    attempts,
  });
}

/** Promise.race timeout helper. */
async function callWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Mock analyser used when no API key is configured. Returns a plausible
 * rajma-chawal plate so integration tests can run end-to-end without
 * calling real APIs (network-restricted CI sandboxes, local dev, etc.).
 */
export function mockAnalysis(): FoodAnalysis {
  const foods = [
    {
      name: "rajma cooked",
      name_hindi: "राजमा",
      portion_grams: 150,
      calories: 191,
      protein_g: 13,
      carbs_g: 34,
      fat_g: 1,
      is_veg: true,
    },
    {
      name: "brown rice cooked",
      name_hindi: "भूरा चावल",
      portion_grams: 150,
      calories: 185,
      protein_g: 4,
      carbs_g: 38,
      fat_g: 2,
      is_veg: true,
    },
  ] as const;
  const total = foods.reduce(
    (acc, f) => ({
      calories: acc.calories + f.calories,
      protein: acc.protein + f.protein_g,
      carbs: acc.carbs + f.carbs_g,
      fat: acc.fat + f.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const result = {
    foods: foods.map((f) => ({ ...f })),
    total_calories: total.calories,
    total_protein_g: total.protein,
    total_carbs_g: total.carbs,
    total_fat_g: total.fat,
    confidence: 0.82,
    notes: "MOCK analyser — no AI provider configured.",
  };
  return foodAnalysisZod.parse(result);
}
