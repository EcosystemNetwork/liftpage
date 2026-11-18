import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "lp_session";

/**
 * Optimistic check only: no cookie, no private pages. The real check, signature and
 * role, happens in lib/dal.ts on every page, action, and route handler.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/desk/:path*", "/admin/:path*", "/account/:path*"],
};
