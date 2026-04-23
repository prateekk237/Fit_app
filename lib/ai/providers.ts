/**
 * OpenAI-compatible provider configs for food-photo analysis.
 *
 * Every entry shares the OpenAI SDK chat/completions shape — only
 * baseURL, model, and whether JSON-schema response_format is supported
 * differ. The fallback chain tries each provider with an API key set,
 * in declaration order, until one returns a schema-valid payload.
 */
import OpenAI from "openai";
import { foodAnalysisJsonSchema, foodAnalysisZod, SYSTEM_PROMPT, type FoodAnalysis } from "./schema";
import { compressForAI, toDataUrl } from "./image";

export type ProviderName = "nvidia-nim" | "groq" | "gemini" | "openrouter" | "mock";

export interface Provider {
  name: ProviderName;
  available: () => boolean;
  analyze: (buffer: Buffer) => Promise<FoodAnalysis>;
}

function callJsonCompat(opts: {
  apiKey: string;
  baseURL: string;
  model: string;
  useSchema: boolean;
  dataUrl: string;
  timeoutMs?: number;
}): Promise<FoodAnalysis> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    timeout: opts.timeoutMs ?? 30_000,
  });
  return client.chat.completions
    .create({
      model: opts.model,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: opts.useSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: "FoodAnalysis",
              schema: foodAnalysisJsonSchema as unknown as Record<string, unknown>,
              strict: true,
            },
          }
        : { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this plate. Output the JSON only." },
            { type: "image_url", image_url: { url: opts.dataUrl } },
          ],
        },
      ],
    })
    .then((resp) => {
      const raw = resp.choices?.[0]?.message?.content;
      if (!raw) throw new Error("Empty AI response");
      const parsed = JSON.parse(raw);
      const validated = foodAnalysisZod.safeParse(parsed);
      if (!validated.success) {
        throw new Error(
          `Schema validation failed: ${validated.error.issues[0]?.message}`,
        );
      }
      return validated.data;
    });
}

export const PROVIDERS: Provider[] = [
  {
    name: "nvidia-nim",
    available: () => !!process.env.NVIDIA_API_KEY,
    analyze: async (buf) => {
      const compressed = await compressForAI(buf);
      const dataUrl = await toDataUrl(compressed);
      return callJsonCompat({
        apiKey: process.env.NVIDIA_API_KEY!,
        baseURL: "https://integrate.api.nvidia.com/v1",
        model: "meta/llama-4-maverick-17b-128e-instruct",
        useSchema: true,
        dataUrl,
      });
    },
  },
  {
    name: "groq",
    available: () => !!process.env.GROQ_API_KEY,
    analyze: async (buf) => {
      const compressed = await compressForAI(buf);
      const dataUrl = await toDataUrl(compressed);
      return callJsonCompat({
        apiKey: process.env.GROQ_API_KEY!,
        baseURL: "https://api.groq.com/openai/v1",
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        useSchema: true,
        dataUrl,
      });
    },
  },
  {
    name: "gemini",
    available: () => !!process.env.GEMINI_API_KEY,
    analyze: async (buf) => {
      const compressed = await compressForAI(buf);
      const dataUrl = await toDataUrl(compressed);
      return callJsonCompat({
        apiKey: process.env.GEMINI_API_KEY!,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-2.5-flash",
        useSchema: false, // Gemini OpenAI-compat mode takes json_object only.
        dataUrl,
      });
    },
  },
];

/** Distinguish retryable (429 / 5xx / network) errors from fatal ones. */
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  const code = (err as { code?: string }).code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") return true;
  return false;
}
