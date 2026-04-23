import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  veg: z.enum(["true", "false"]).optional(),
  category: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

type FoodRow = {
  id: number;
  name: string;
  name_hindi: string | null;
  category: string;
  is_veg: boolean;
  calories_per_100g: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string | null;
  serving_size_g: string;
  serving_description: string | null;
  score: number | null;
};

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad query params" }, { status: 400 });
  }
  const { q, veg, category, limit } = parsed.data;

  // Substring + full-text is primary; trigram word_similarity is only a
  // typo fallback with a tight threshold so 'chicken' doesn't fuzzy-match
  // 'chana' or 'chai'.
  const qRaw = (q ?? "").trim();
  const qLike = `%${qRaw.toLowerCase()}%`;
  const FUZZY_THRESHOLD = 0.4;

  const rows = await prisma.$queryRaw<FoodRow[]>`
    SELECT
      f.id,
      f.name,
      f.name_hindi,
      f.category,
      f.is_veg,
      f.calories_per_100g::text AS calories_per_100g,
      f.protein_g::text          AS protein_g,
      f.carbs_g::text            AS carbs_g,
      f.fat_g::text              AS fat_g,
      f.fiber_g::text            AS fiber_g,
      f.serving_size_g::text     AS serving_size_g,
      f.serving_description,
      CASE
        WHEN ${qRaw} = '' THEN NULL
        WHEN lower(f.name) LIKE ${qLike} OR lower(coalesce(f.name_hindi,'')) LIKE ${qLike}
          THEN 1.0::float
        ELSE GREATEST(
          word_similarity(lower(${qRaw}), lower(f.name)),
          COALESCE(word_similarity(lower(${qRaw}), lower(f.name_hindi)), 0)
        )::float
      END AS score
    FROM foods f
    WHERE
      (
        ${qRaw} = ''
        OR lower(f.name) LIKE ${qLike}
        OR lower(coalesce(f.name_hindi,'')) LIKE ${qLike}
        OR f.search_tokens @@ websearch_to_tsquery('simple', ${qRaw})
        OR word_similarity(lower(${qRaw}), lower(f.name)) > ${FUZZY_THRESHOLD}
        OR (
          f.name_hindi IS NOT NULL
          AND word_similarity(lower(${qRaw}), lower(f.name_hindi)) > ${FUZZY_THRESHOLD}
        )
      )
      AND (${veg ?? ""} = '' OR f.is_veg = (${veg ?? ""} = 'true'))
      AND (${category ?? ""} = '' OR f.category = ${category ?? ""})
    ORDER BY
      score DESC NULLS LAST,
      length(f.name) ASC,
      f.name ASC
    LIMIT ${limit}
  `;

  const foods = rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameHindi: r.name_hindi,
    category: r.category,
    isVeg: r.is_veg,
    caloriesPer100g: Number(r.calories_per_100g),
    proteinG: Number(r.protein_g),
    carbsG: Number(r.carbs_g),
    fatG: Number(r.fat_g),
    fiberG: r.fiber_g != null ? Number(r.fiber_g) : null,
    servingSizeG: Number(r.serving_size_g),
    servingDescription: r.serving_description,
    score: r.score,
  }));

  return NextResponse.json({ foods });
}
