import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/keepalive
 *   Pings Neon every ~4 min during active hours (07:00 – 23:00 IST)
 *   from cron-job.org so the serverless DB doesn't auto-pause and
 *   give users a 3–5s cold start on their first food log.
 */
export async function GET(req: Request) {
  const blocked = checkCronAuth(req);
  if (blocked) return blocked;
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
