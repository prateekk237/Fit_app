import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkCronAuth } from "@/lib/cron-auth";
import { generateWeeklyDigest } from "@/lib/ai/weekly-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const CACHE_TYPE = "WEEKLY_DIGEST";

/**
 * GET /api/cron/weekly-digest
 *   Triggered Sunday 21:00 IST (Mon 03:30 UTC) by cron-job.org.
 *   Regenerates the digest for every user and replaces the cached row
 *   in alerts_sent. Bearer-auth gated.
 */
export async function GET(req: Request) {
  const blocked = checkCronAuth(req);
  if (blocked) return blocked;

  const users = await prisma.user.findMany({ select: { id: true } });
  const results = [];
  for (const u of users) {
    try {
      const outcome = await generateWeeklyDigest(u.id);
      const payload = {
        generatedAt: new Date().toISOString(),
        provider: outcome.provider,
        durationMs: outcome.durationMs,
        weekStart: outcome.stats.weekStart,
        weekEnd: outcome.stats.weekEnd,
        result: outcome.result,
        stats: outcome.stats,
      };
      await prisma.alertSent.deleteMany({
        where: { userId: u.id, type: CACHE_TYPE },
      });
      await prisma.alertSent.create({
        data: {
          userId: u.id,
          type: CACHE_TYPE,
          message: outcome.result.headline ?? "Weekly digest",
          dataJson: payload as unknown as Prisma.InputJsonValue,
        },
      });
      results.push({
        userId: u.id,
        provider: outcome.provider,
        ms: outcome.durationMs,
      });
    } catch (err) {
      results.push({ userId: u.id, error: (err as Error).message });
    }
  }
  return NextResponse.json({ at: new Date().toISOString(), results });
}
