import type { Exercise } from "@prisma/client";

export function serializeExercise(e: Exercise) {
  return {
    id: e.id,
    slug: e.slug,
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
  };
}
