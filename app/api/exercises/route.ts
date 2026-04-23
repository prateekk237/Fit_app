import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { serializeExercise } from "@/lib/exercises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Query shape: /api/exercises?q=push&category=push&category=fullbody&muscle=chest&equipment=dumbbell
function parseList(url: URL, key: string): string[] {
  return url.searchParams.getAll(key).filter((v) => v.length > 0);
}

const singleSchema = z.object({
  q: z.string().max(60).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = singleSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad query" }, { status: 400 });
  const { q, difficulty, limit } = parsed.data;

  const categories = parseList(url, "category");
  const muscles = parseList(url, "muscle");
  const equipments = parseList(url, "equipment");

  const where: Prisma.ExerciseWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q.toLowerCase() } },
    ];
  }
  if (categories.length) where.category = { in: categories };
  if (difficulty) where.difficulty = difficulty;
  if (muscles.length) where.muscleGroups = { hasSome: muscles };
  if (equipments.length) where.equipmentNeeded = { hasSome: equipments };

  const rows = await prisma.exercise.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: limit,
  });

  return NextResponse.json({
    total: rows.length,
    exercises: rows.map(serializeExercise),
    facets: await getFacets(),
  });
}

async function getFacets() {
  // Distinct facet lists so the UI can render chips without extra roundtrips.
  const rows = await prisma.exercise.findMany({
    select: { category: true, muscleGroups: true, equipmentNeeded: true, difficulty: true },
  });
  const categories = new Set<string>();
  const muscles = new Set<string>();
  const equipment = new Set<string>();
  const difficulties = new Set<string>();
  for (const r of rows) {
    categories.add(r.category);
    for (const m of r.muscleGroups ?? []) muscles.add(m);
    for (const e of r.equipmentNeeded ?? []) equipment.add(e);
    if (r.difficulty) difficulties.add(r.difficulty);
  }
  return {
    categories: Array.from(categories).sort(),
    muscles: Array.from(muscles).sort(),
    equipment: Array.from(equipment).sort(),
    difficulties: Array.from(difficulties).sort(),
  };
}

