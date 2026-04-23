import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hitRateLimit } from "@/lib/rate-limit";
import { analyzeFoodPhoto } from "@/lib/ai/nim";
import { inferMealType, isValidMealType } from "@/lib/food-logs";
import { getLocalDateUTC } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB hard cap before sharp compression

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Protect expensive AI calls — cap to 12 per 5 min per user.
  const rl = hitRateLimit(`photo:${session.userId}`, {
    max: 12,
    windowMs: 5 * 60_000,
  });
  if (rl.blocked) {
    return NextResponse.json(
      { error: "Too many photos. Wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 10 MB)" }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: `Unsupported type: ${file.type}` },
      { status: 415 },
    );
  }

  const mealTypeIn = form.get("meal_type");
  const previewOnly = form.get("preview") === "1";

  const buf = Buffer.from(await file.arrayBuffer());

  // AI analysis with fallback + backoff.
  let outcome;
  try {
    outcome = await analyzeFoodPhoto(buf);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 502;
    return NextResponse.json(
      {
        error: "AI analysis failed",
        attempts: (err as { attempts?: unknown }).attempts ?? [],
      },
      { status },
    );
  }

  const { result, provider, attempts, durationMs } = outcome;

  if (previewOnly) {
    return NextResponse.json({
      provider,
      durationMs,
      attempts,
      result,
      logIds: [],
    });
  }

  // Persist one food_logs row per detected food, linking food_id when we
  // can match the AI's canonical name to our seeded foods.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const logDate = getLocalDateUTC(user.timezone);
  const mealType =
    typeof mealTypeIn === "string" && isValidMealType(mealTypeIn)
      ? mealTypeIn
      : inferMealType(user.timezone);

  const logIds: string[] = [];
  for (const item of result.foods) {
    const canonical = item.name.trim().toLowerCase();
    const food = await prisma.food.findFirst({
      where: { name: canonical },
    });
    const created = await prisma.foodLog.create({
      data: {
        userId: user.id,
        logDate,
        foodId: food?.id ?? null,
        foodName: item.name,
        portionG: new Prisma.Decimal(item.portion_grams),
        calories: new Prisma.Decimal(item.calories),
        proteinG: new Prisma.Decimal(item.protein_g),
        carbsG: new Prisma.Decimal(item.carbs_g),
        fatG: new Prisma.Decimal(item.fat_g),
        fiberG: null,
        source: "photo",
        mealType,
        aiConfidence: new Prisma.Decimal(result.confidence.toFixed(2)),
        aiRawJson: result as unknown as Prisma.InputJsonValue,
      },
    });
    logIds.push(created.id);
  }

  return NextResponse.json(
    { provider, durationMs, attempts, result, logIds },
    { status: 201 },
  );
}
