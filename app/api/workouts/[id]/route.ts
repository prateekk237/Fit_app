import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

interface ExerciseRef {
  slug: string;
  sets?: number;
  reps?: string | number;
  rest_sec?: number;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idParse = idSchema.safeParse(params.id);
  if (!idParse.success) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const workout = await prisma.workout.findUnique({ where: { id: idParse.data } });
  if (!workout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Join exercises_json with the exercises table so the client gets demo
  // images / instructions / form cues / slugs in one roundtrip.
  const refs = Array.isArray(workout.exercisesJson)
    ? (workout.exercisesJson as unknown as ExerciseRef[])
    : [];
  const slugs = Array.from(new Set(refs.map((r) => r.slug).filter(Boolean)));
  const exRows = slugs.length
    ? await prisma.exercise.findMany({ where: { slug: { in: slugs } } })
    : [];
  const exBySlug = new Map(exRows.map((e) => [e.slug, e]));

  const exercises = refs.map((ref, i) => {
    const e = exBySlug.get(ref.slug);
    return {
      order: i,
      slug: ref.slug,
      sets: typeof ref.sets === "number" ? ref.sets : 3,
      reps: ref.reps ?? "—",
      rest_sec: typeof ref.rest_sec === "number" ? ref.rest_sec : 60,
      exercise: e
        ? {
            name: e.name,
            category: e.category,
            muscleGroups: e.muscleGroups,
            equipmentNeeded: e.equipmentNeeded,
            difficulty: e.difficulty,
            imageUrl: e.imageUrl,
            youtubeId: e.youtubeId,
            attribution: e.attribution,
            instructions: e.instructions,
            formCue: e.formCue,
            commonMistakes: e.commonMistakes,
          }
        : null,
    };
  });

  return NextResponse.json({
    id: workout.id,
    dayNumber: workout.dayNumber,
    name: workout.name,
    category: workout.category,
    durationMin: workout.durationMin,
    description: workout.description,
    exercises,
  });
}
