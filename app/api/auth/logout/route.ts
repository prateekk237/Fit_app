import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
