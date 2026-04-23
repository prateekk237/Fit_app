import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifySession } from "@/lib/auth-edge";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/icons") ||
      pathname.startsWith("/exercises") || pathname === "/favicon.ico" ||
      pathname === "/manifest.json" || pathname === "/sw.js" ||
      pathname.startsWith("/workbox-")) {
    return true;
  }
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    // API: respond 401; pages: redirect to /login with ?from=…
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Logged-in users visiting /login go home instead.
  if (pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|exercises|manifest.json|sw.js|workbox-.*).*)",
  ],
};
