/**
 * Public analyser. Tries NIM → Groq → Gemini with exponential-backoff
 * retry inside each provider, then falls through to the next on 429/5xx.
 * If nothing is configured, returns a mock response so dev/test flows
 * still round-trip end-to-end.
 */
import { PROVIDERS, isRetryable, type ProviderName } from "./providers";
import { foodAnalysisZod, type FoodAnalysis } from "./schema";

export interface AnalyzeOutcome {
  result: FoodAnalysis;
  provider: ProviderName;
  attempts: Array<{ provider: ProviderName; error?: string }>;
  durationMs: number;
}

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
    try {
      const result = await runWithBackoff(() => provider.analyze(buffer));
      attempts.push({ provider: provider.name });
      return { result, provider: provider.name, attempts, durationMs: Date.now() - started };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      attempts.push({ provider: provider.name, error: message });
      // Keep going only for retryable errors; fatal errors abort.
      if (!isRetryable(err) && !/schema|JSON|Empty AI|timeout/i.test(message)) {
        break;
      }
    }
  }

  throw Object.assign(new Error("All AI providers exhausted"), {
    status: 503,
    attempts,
  });
}

async function runWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseMs = 500,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === maxRetries) throw err;
      const delay = baseMs * Math.pow(2, i); // 500, 1000, 2000
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
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
