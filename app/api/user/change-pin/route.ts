import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, hashPin, verifyPin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPin: z.string().regex(/^\d{6}$/),
  newPin: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Both PINs must be 6 digits" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = await verifyPin(parsed.data.currentPin, user.pinHash);
  if (!ok) return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });

  const pinHash = await hashPin(parsed.data.newPin);
  await prisma.user.update({ where: { id: user.id }, data: { pinHash } });
  return NextResponse.json({ ok: true });
}
