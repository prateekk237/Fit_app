/**
 * Bearer-token check for cron endpoints. Compares against CRON_SECRET
 * set in Vercel env. Used by /api/cron/* routes.
 *
 * Vercel cron jobs (paid) and external triggers (cron-job.org) both
 * send: Authorization: Bearer <CRON_SECRET>
 */
import { NextResponse } from "next/server";

export function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
