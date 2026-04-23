import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isValidMealType, scaleMacros } from "@/lib/food-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

const patchSchema = z
  .object({
    portionG: z.number().positive().max(3000).optional(),
    mealType: z.string().optional(),
    foodName: z.string().trim().min(1).max(120).optional(),
    calories: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatG: z.number().nonnegative().optional(),
    fiberG: z.number().nonnegative().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

function serialize(log: Awaited<ReturnType<typeof prisma.foodLog.update>>) {
  return {
    id: log.id,
    loggedAt: log.loggedAt,
    logDate: typeof log.logDate === "string"
      ? log.logDate
      : log.logDate.toISOString().slice(0, 10),
    foodId: log.foodId,
    foodName: log.foodName,
    portionG: Number(log.portionG),
    calories: Number(log.calories),
    proteinG: Number(log.proteinG),
    carbsG: Number(log.carbsG),
    fatG: Number(log.fatG),
    fiberG: log.fiberG != null ? Number(log.fiberG) : null,
    source: log.source,
    mealType: log.mealType,
  };
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idParse = uuid.safeParse(params.id);
  if (!idParse.success) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const existing = await prisma.foodLog.findFirst({
    where: { id: idParse.data, userId: session.userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (parsed.data.mealType) {
    if (!isValidMealType(parsed.data.mealType)) {
      return NextResponse.json({ error: "Invalid meal_type" }, { status: 400 });
    }
    patch.mealType = parsed.data.mealType;
  }
  if (parsed.data.foodName) patch.foodName = parsed.data.foodName;

  // Portion change: recompute macros if we have a linked food, otherwise
  // honor user-supplied macro overrides.
  if (parsed.data.portionG != null) {
    if (existing.foodId) {
      const food = await prisma.food.findUnique({ where: { id: existing.foodId } });
      if (food) Object.assign(patch, scaleMacros(food, parsed.data.portionG));
      else patch.portionG = parsed.data.portionG;
    } else {
      patch.portionG = parsed.data.portionG;
    }
  }
  for (const k of ["calories", "proteinG", "carbsG", "fatG", "fiberG"] as const) {
    if (parsed.data[k] != null) patch[k] = parsed.data[k];
  }

  const updated = await prisma.foodLog.update({
    where: { id: existing.id },
    data: patch,
  });
  return NextResponse.json(serialize(updated));
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idParse = uuid.safeParse(params.id);
  if (!idParse.success) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const res = await prisma.foodLog.deleteMany({
    where: { id: idParse.data, userId: session.userId },
  });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
