import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkCronAuth } from "@/lib/cron-auth";
import { evaluateForUser } from "@/lib/alerts/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/cron/alerts
 *   Triggered every 15 min by cron-job.org. Walks every user's rule
 *   set and persists / dispatches alerts. Bearer-auth gated.
 */
export async function GET(req: Request) {
  const blocked = checkCronAuth(req);
  if (blocked) return blocked;

  const users = await prisma.user.findMany({ select: { id: true } });
  const results = [];
  for (const u of users) {
    try {
      const out = await evaluateForUser(u.id);
      results.push({
        userId: u.id,
        fired: out.fired.length,
        delivered: out.delivered,
        quietHours: out.quietHours,
      });
    } catch (err) {
      results.push({ userId: u.id, error: (err as Error).message });
    }
  }
  return NextResponse.json({ at: new Date().toISOString(), results });
}
