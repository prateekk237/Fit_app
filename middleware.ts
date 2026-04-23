import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Phase 0 stub: log the requested path and continue.
// Phase 2 will verify the `fit_token` JWT cookie and redirect unauthenticated
// users from `/(app)/*` to `/login`.
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    console.log("[middleware]", request.nextUrl.pathname);
  }
  return NextResponse.next();
}

export const config = {
  // Match everything except static assets and the PWA service worker.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|exercises|manifest.json|sw.js|workbox-.*).*)",
  ],
};
