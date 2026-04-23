import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDateUTC } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const start = getLocalDateUTC(user.timezone);

  const alerts = await prisma.alertSent.findMany({
    where: {
      userId: user.id,
      dismissedAt: null,
      sentAt: { gte: start },
      // Hide internal cache rows (e.g. WEEKLY_DIGEST stored here for reuse).
      NOT: { type: { startsWith: "WEEKLY_DIGEST" } },
    },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    alerts: alerts.map((a) => ({
      id: a.id.toString(),
      type: a.type,
      message: a.message,
      sentAt: a.sentAt,
      data: a.dataJson,
    })),
  });
}
