// Phase 2 will implement PIN login, bcrypt hashing, and JWT sign/verify.
// This stub exists so imports and middleware paths resolve in Phase 0.

export const AUTH_COOKIE = "fit_token";

export type SessionPayload = {
  userId: string;
  iat: number;
  exp: number;
};

export async function verifySession(_token: string | undefined): Promise<SessionPayload | null> {
  // Implemented in Phase 2.
  return null;
}
