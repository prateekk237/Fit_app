// Node-runtime auth helpers. Re-exports the edge-safe primitives plus
// bcrypt-based password handling and cookie-jar readers that depend on
// `next/headers` and Prisma.

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  AUTH_COOKIE,
  COOKIE_MAX_AGE_SEC,
  SessionPayload,
  signSession,
  verifySession,
  sessionCookieOptions,
} from "@/lib/auth-edge";

export {
  AUTH_COOKIE,
  COOKIE_MAX_AGE_SEC,
  signSession,
  verifySession,
  sessionCookieOptions,
};
export type { SessionPayload };

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * Server-component / route-handler helper. Cached per request so multiple
 * calls in the same render don't re-hit the cookie jar.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return verifySession(token);
});

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
});
