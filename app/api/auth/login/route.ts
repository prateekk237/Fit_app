import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AUTH_COOKIE, signSession, verifyPin, sessionCookieOptions } from "@/lib/auth";
import { hitRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits"),
});

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = hitRateLimit(`login:${ip}`, { max: 3, windowMs: 15 * 60_000 });
  if (rl.blocked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Single-user app: match the sole user. (Multi-user? replace with email lookup.)
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    return NextResponse.json(
      { error: "No user seeded. Run `pnpm db:seed`." },
      { status: 500 },
    );
  }

  const ok = await verifyPin(parsed.data.pin, user.pinHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Incorrect PIN", remaining: rl.remaining },
      { status: 401 },
    );
  }

  const token = await signSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookieOptions(), value: token });
  return res;
}
