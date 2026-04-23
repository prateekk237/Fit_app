import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDateUTC } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  amountMl: z.number().int().positive().max(5000),
  loggedAt: z.string().datetime().optional(),
});

function serialize(log: Awaited<ReturnType<typeof prisma.waterLog.create>>) {
  return {
    id: log.id.toString(),
    loggedAt: log.loggedAt,
    logDate:
      typeof log.logDate === "string"
        ? log.logDate
        : log.logDate.toISOString().slice(0, 10),
    amountMl: log.amountMl,
  };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const logDate = dateParam
    ? new Date(`${dateParam}T00:00:00Z`)
    : getLocalDateUTC(user.timezone);

  const logs = await prisma.waterLog.findMany({
    where: { userId: user.id, logDate },
    orderBy: { loggedAt: "asc" },
  });

  const totalMl = logs.reduce((a, b) => a + b.amountMl, 0);
  return NextResponse.json({
    date:
      typeof logDate === "string"
        ? logDate
        : logDate.toISOString().slice(0, 10),
    totalMl,
    targetMl: user.dailyWaterTargetMl,
    logs: logs.map(serialize),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const loggedAt = parsed.data.loggedAt ? new Date(parsed.data.loggedAt) : new Date();
  const logDate = getLocalDateUTC(user.timezone, loggedAt);

  const created = await prisma.waterLog.create({
    data: {
      userId: user.id,
      amountMl: parsed.data.amountMl,
      loggedAt,
      logDate,
    },
  });
  return NextResponse.json(serialize(created), { status: 201 });
}
