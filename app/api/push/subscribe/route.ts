import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(10).max(200),
  }),
  expirationTime: z.number().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = subSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid subscription" },
      { status: 400 },
    );
  }

  const { endpoint, keys } = parsed.data;
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  const row = existing
    ? await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { p256dhKey: keys.p256dh, authKey: keys.auth, userId: session.userId },
      })
    : await prisma.pushSubscription.create({
        data: {
          userId: session.userId,
          endpoint,
          p256dhKey: keys.p256dh,
          authKey: keys.auth,
        },
      });

  return NextResponse.json({ id: row.id, ok: true }, { status: existing ? 200 : 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: session.userId },
    select: { id: true, endpoint: true, createdAt: true },
  });
  return NextResponse.json({
    subscriptions: subs,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}
