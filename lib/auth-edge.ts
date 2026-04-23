// Edge-safe auth helpers. Imported by middleware.ts and the Node-only
// `lib/auth.ts` alike. Must not pull in bcryptjs, Prisma, or next/headers.

import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "fit_token";
export const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = {
  userId: string;
  iat: number;
  exp: number;
};

function getSecretKey(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET is missing or shorter than 16 characters");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE_SEC}s`)
    .sign(getSecretKey());
}

export async function verifySession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    name: AUTH_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}
