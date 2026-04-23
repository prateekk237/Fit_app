import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateWeeklyDigest } from "@/lib/ai/weekly-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TYPE = "WEEKLY_DIGEST";
const MAX_AGE_MIN = 12 * 60; // regenerate after 12 h

interface CachedPayload {
  generatedAt: string;
  provider: string;
  durationMs: number;
  weekStart: string;
  weekEnd: string;
  result: {
    headline?: string;
    insights: string[];
    recommendation: string;
    risk_flag?: string | null;
  };
  stats: unknown;
}

async function readCached(userId: string): Promise<CachedPayload | null> {
  const row = await prisma.alertSent.findFirst({
    where: { userId, type: CACHE_TYPE },
    orderBy: { sentAt: "desc" },
  });
  if (!row) return null;
  const age = (Date.now() - row.sentAt.getTime()) / 60_000;
  if (age > MAX_AGE_MIN) return null;
  return row.dataJson as unknown as CachedPayload;
}

async function writeCached(userId: string, payload: CachedPayload) {
  // A single "live" row per user — purge older ones so the table
  // doesn't balloon.
  await prisma.alertSent.deleteMany({ where: { userId, type: CACHE_TYPE } });
  await prisma.alertSent.create({
    data: {
      userId,
      type: CACHE_TYPE,
      message: payload.result.headline ?? "Weekly digest",
      dataJson: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

async function regenerate(userId: string): Promise<CachedPayload> {
  const outcome = await generateWeeklyDigest(userId);
  const payload: CachedPayload = {
    generatedAt: new Date().toISOString(),
    provider: outcome.provider,
    durationMs: outcome.durationMs,
    weekStart: outcome.stats.weekStart,
    weekEnd: outcome.stats.weekEnd,
    result: outcome.result,
    stats: outcome.stats,
  };
  await writeCached(userId, payload);
  return payload;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const cached = force ? null : await readCached(session.userId);
  const payload = cached ?? (await regenerate(session.userId));
  return NextResponse.json(payload);
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await regenerate(session.userId);
  return NextResponse.json(payload, { status: 201 });
}
