import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { serializeExercise } from "@/lib/exercises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ex = await prisma.exercise.findUnique({ where: { slug: params.slug } });
  if (!ex) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Related by shared muscle groups for a "Similar exercises" rail.
  const related = ex.muscleGroups?.length
    ? await prisma.exercise.findMany({
        where: {
          slug: { not: ex.slug },
          muscleGroups: { hasSome: ex.muscleGroups },
        },
        take: 6,
      })
    : [];

  return NextResponse.json({
    exercise: serializeExercise(ex),
    related: related.map(serializeExercise),
  });
}
