import type { Muscle } from "react-body-highlighter";

/**
 * Map the internal muscle_groups we seed in prisma/seed/exercises.json to the
 * Muscle string literals react-body-highlighter understands. One internal
 * name may expand to multiple anatomical muscles (e.g. shoulders → front +
 * back deltoids).
 */
const RAW_MAP: Record<string, Muscle[]> = {
  chest: ["chest"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  shoulders: ["front-deltoids", "back-deltoids"],
  traps: ["trapezius"],
  forearms: ["forearm"],
  back: ["upper-back", "lower-back", "trapezius"],
  "upper-back": ["upper-back", "trapezius"],
  "lower-back": ["lower-back"],
  core: ["abs", "obliques"],
  abs: ["abs"],
  obliques: ["obliques"],
  quads: ["quadriceps"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstring"],
  hamstring: ["hamstring"],
  glutes: ["gluteal"],
  gluteal: ["gluteal"],
  calves: ["calves"],
  adductors: ["adductor"],
  abductors: ["abductors"],
  "full-body": [
    "chest",
    "abs",
    "quadriceps",
    "biceps",
    "triceps",
    "front-deltoids",
  ],
  fullbody: [
    "chest",
    "abs",
    "quadriceps",
    "biceps",
    "triceps",
    "front-deltoids",
  ],
  legs: ["quadriceps", "hamstring", "gluteal", "calves"],
};

export function toHighlighterMuscles(muscles: string[]): Muscle[] {
  const out = new Set<Muscle>();
  for (const m of muscles) {
    const mapped = RAW_MAP[m.toLowerCase()];
    if (mapped) for (const v of mapped) out.add(v);
  }
  return Array.from(out);
}
