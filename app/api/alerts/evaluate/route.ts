import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { evaluateForUser } from "@/lib/alerts/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    dryRun: z.boolean().optional(),
    respectQuietHours: z.boolean().optional(),
    mockNow: z.string().datetime().optional(),
  })
  .optional();

/**
 * POST /api/alerts/evaluate
 *   Walks every rule against the authenticated user's current state,
 *   persists alerts_sent rows for newly-firing rules, and dispatches
 *   Web Push. Accepts { dryRun, respectQuietHours, mockNow } for
 *   testing. In production the cron singleton calls this same path.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown = undefined;
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    /* optional body */
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await evaluateForUser(session.userId, {
    dryRun: parsed.data?.dryRun,
    respectQuietHours: parsed.data?.respectQuietHours,
    mockNow: parsed.data?.mockNow ? new Date(parsed.data.mockNow) : undefined,
  });
  return NextResponse.json(result);
}
