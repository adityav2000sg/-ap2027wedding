import { NextRequest, NextResponse } from "next/server";

import { CANONICAL_SITE_ORIGIN, LEGACY_RAILWAY_HOST } from "@/config/site";

/**
 * Keep Railway's generated hostname out of family and guest-facing URLs.
 * The liveness endpoint is excluded by the matcher below so Railway can still
 * check the service directly without following a redirect.
 */
export function proxy(request: NextRequest) {
  const incomingHost = request.headers.get("host")?.split(":", 1)[0]?.toLowerCase();
  if (incomingHost !== LEGACY_RAILWAY_HOST) {
    return NextResponse.next();
  }

  const destination = new URL(request.nextUrl.pathname, CANONICAL_SITE_ORIGIN);
  destination.search = request.nextUrl.search;
  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"],
};
