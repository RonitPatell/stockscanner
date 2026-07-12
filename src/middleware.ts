import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight edge protections. Session/Pro checks stay in route handlers
 * (API auth cannot rely on middleware alone with JWT + Prisma).
 */
export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Soft hint for auth spam — real limits are in authorize() + register
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/auth") || path === "/api/auth/register") {
    res.headers.set("Cache-Control", "no-store");
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/desk/:path*",
    "/api/:path*",
  ],
};
