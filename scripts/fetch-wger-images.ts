/**
 * Download exercise images from wger.de (CC-BY-SA 4.0) into /public/exercises/
 * and populate `exercises.image_url` for any rows that don't already have one.
 *
 * wger API: https://wger.de/api/v2/
 *   - GET /exercise/?language=2&limit=...   (English exercises w/ image references)
 *   - GET /exerciseimage/?exercise_base=... (the actual image URLs)
 *
 * We match wger exercises to our seeded exercises by fuzzy name.
 * Exercises that wger doesn't cover are left with null image_url — their
 * youtube_id (set manually) renders an iframe in the UI instead.
 *
 * Usage:   pnpm tsx scripts/fetch-wger-images.ts
 * Usage:   pnpm tsx scripts/fetch-wger-images.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";

const prisma = new PrismaClient();

const WGER_BASE = "https://wger.de/api/v2";
const OUT_DIR = join(process.cwd(), "public", "exercises");
const ATTRIBUTION = "wger.de (CC BY-SA 4.0)";

// Manual alias table: our slug → the dominant wger search term.
// Kept here because slugs and wger titles don't match 1:1.
const WGER_SEARCH: Record<string, string> = {
  "push-up": "push up",
  "push-up-incline": "incline push up",
  "push-up-decline": "decline push up",
  "push-up-diamond": "diamond push up",
  "db-bench-press": "dumbbell bench press",
  "db-shoulder-press": "dumbbell shoulder press",
  "db-lateral-raise": "dumbbell lateral raise",
  "pike-push-up": "pike push up",
  "chair-dip": "triceps dip",
  "overhead-tricep-extension": "overhead triceps extension",
  "bent-over-db-row": "bent over row",
  "single-arm-row": "one arm row",
  "db-rdl": "romanian deadlift",
  "db-curl": "biceps curl",
  "hammer-curl": "hammer curl",
  "reverse-fly": "reverse fly",
  "pull-up": "pull up",
  "inverted-row": "inverted row",
  "band-face-pull": "face pull",
  "superman": "superman",
  "bw-squat": "squat",
  "goblet-squat": "goblet squat",
  "walking-lunge": "walking lunge",
  "bulgarian-split-squat": "bulgarian split squat",
  "glute-bridge": "glute bridge",
  "hip-thrust": "hip thrust",
  "calf-raise": "calf raise",
  "wall-sit": "wall sit",
  "jump-squat": "jump squat",
  "step-up": "step up",
  burpee: "burpee",
  "mountain-climber": "mountain climber",
  "jumping-jack": "jumping jack",
  "high-knees": "high knees",
  "squat-jump": "squat jump",
  "skater-jump": "skater",
  "db-thruster": "thruster",
  "renegade-row": "renegade row",
  "db-swing": "kettlebell swing",
  "bear-crawl": "bear crawl",
  "jumping-rope": "jump rope",
  "shadow-boxing": "shadow boxing",
  "running-in-place": "running in place",
  plank: "plank",
  "side-plank": "side plank",
  "russian-twist": "russian twist",
  "leg-raise": "leg raise",
  "dead-bug": "dead bug",
  "bird-dog": "bird dog",
  "bicycle-crunch": "bicycle crunch",
};

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "fit-pwa/0.1" },
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as T;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: ${url}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest));
}

type WgerSearchResp = {
  suggestions: Array<{
    value: string;
    data: { id: number; base_id: number; image: string | null; image_thumbnail: string | null };
  }>;
};

async function searchWger(
  term: string,
): Promise<{ baseId: number; image: string | null } | null> {
  const url = `${WGER_BASE}/exercise/search/?language=en&term=${encodeURIComponent(term)}`;
  const resp = await fetchJSON<WgerSearchResp>(url);
  const first = resp.suggestions?.[0]?.data;
  if (!first) return null;
  return { baseId: first.base_id, image: first.image };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const exercises = await prisma.exercise.findMany({
    where: { imageUrl: null },
    orderBy: { id: "asc" },
  });
  console.log(
    `${exercises.length} exercises missing image_url${dryRun ? " (dry run)" : ""}.`,
  );

  let fetched = 0;
  let skipped = 0;
  for (const ex of exercises) {
    const term = WGER_SEARCH[ex.slug] ?? ex.name.toLowerCase();
    try {
      const hit = await searchWger(term);
      if (!hit || !hit.image) {
        console.log(`  · ${ex.slug}: no wger image for "${term}" — skipping`);
        skipped++;
        continue;
      }
      const outPath = join(OUT_DIR, `${ex.slug}.png`);
      const publicUrl = `/exercises/${ex.slug}.png`;
      if (dryRun) {
        console.log(`  ? ${ex.slug} ← ${hit.image}`);
      } else {
        await downloadFile(hit.image, outPath);
        await prisma.exercise.update({
          where: { id: ex.id },
          data: { imageUrl: publicUrl, attribution: ATTRIBUTION },
        });
        console.log(`  ✓ ${ex.slug}`);
      }
      fetched++;
      // Rate limit: wger asks for ≤ 1 req/sec unauthenticated.
      await new Promise((r) => setTimeout(r, 1100));
    } catch (err) {
      console.error(`  ✗ ${ex.slug}: ${(err as Error).message}`);
      skipped++;
    }
  }
  console.log(`Done: fetched ${fetched}, skipped ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
