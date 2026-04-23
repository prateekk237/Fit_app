/**
 * Shared JSON-schema + Zod schema for the AI photo analyser.
 * Used by: lib/ai/nim.ts (response_format.json_schema), fallback providers
 * (parse validator), /api/food-logs/photo (runtime safety net).
 */
import { z } from "zod";

export const foodItemZod = z.object({
  name: z.string().min(1).max(120),
  name_hindi: z.string().max(120).nullable().optional(),
  portion_grams: z.number().min(1).max(2000),
  calories: z.number().min(0).max(3000),
  protein_g: z.number().min(0).max(250),
  carbs_g: z.number().min(0).max(400),
  fat_g: z.number().min(0).max(250),
  is_veg: z.boolean(),
});

export const foodAnalysisZod = z.object({
  foods: z.array(foodItemZod).min(0).max(20),
  total_calories: z.number().min(0).max(10000),
  total_protein_g: z.number().min(0).max(1000),
  total_carbs_g: z.number().min(0).max(2000),
  total_fat_g: z.number().min(0).max(1000),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(1000).optional(),
});

export type FoodAnalysis = z.infer<typeof foodAnalysisZod>;
export type FoodItem = z.infer<typeof foodItemZod>;

/**
 * JSON Schema matching foodAnalysisZod, for use with OpenAI-compatible
 * `response_format: { type: 'json_schema', schema: … }`.
 */
export const foodAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    foods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          name_hindi: { type: ["string", "null"] },
          portion_grams: { type: "number" },
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          is_veg: { type: "boolean" },
        },
        required: [
          "name",
          "portion_grams",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_g",
          "is_veg",
        ],
      },
    },
    total_calories: { type: "number" },
    total_protein_g: { type: "number" },
    total_carbs_g: { type: "number" },
    total_fat_g: { type: "number" },
    confidence: { type: "number" },
    notes: { type: "string" },
  },
  required: [
    "foods",
    "total_calories",
    "total_protein_g",
    "total_carbs_g",
    "total_fat_g",
    "confidence",
  ],
} as const;

export const SYSTEM_PROMPT = `You are an expert Indian-cuisine nutritionist and computer-vision analyst.

TASK: For each food visible in the photo, output JSON per the schema.

RULES:
1. Identify EVERY dish including sides (ghee, pickle, papad, chutneys, raita).
2. Use canonical lowercase names: "dal tadka", "paneer butter masala", "aloo gobi",
   "sambhar", "idli", "dosa", "biryani", "roti", "basmati rice", "jeera rice",
   "paneer bhurji", "palak paneer", "chicken tikka", "tandoori chicken",
   "besan chilla", "poha", "upma", "rajma chawal", "chole".
3. Portion cues:
   - Standard plate ≈ 25–28 cm
   - Katori (bowl) ≈ 150 ml ≈ 150 g curries
   - 1 roti ≈ 30–40 g; 1 naan ≈ 70–90 g
   - 1 idli ≈ 35 g; 1 dosa ≈ 80 g; 1 cup rice ≈ 150 g
   - 1 paneer cube ≈ 15 g; 1 chicken tikka piece ≈ 30 g
4. Macros per IFCT-2017 / USDA values (per 100 g cooked).
5. total_* = sum, rounded to nearest integer.
6. confidence 0–1, MIN across per-item confidences.
7. Output ONLY valid JSON matching the schema. No prose, no markdown fences.`;
