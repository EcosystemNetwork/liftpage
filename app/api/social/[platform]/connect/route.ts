import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminOrResponse } from "@/lib/dal";
import { authorizeUrl, OAUTH_COOKIE } from "@/lib/social/oauth";
import { connectablePlatforms } from "@/lib/social/providers";
import { loadBrand } from "@/lib/store";
import type { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";



/** GET /api/social/<platform>/connect?board=<id>: off to the network's consent screen. */
export async function GET(request: Request, { params }: RouteContext<"/api/social/[platform]/connect">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const platform = (await params).platform as Platform;
  if (!connectablePlatforms().includes(platform)) {
    return Response.json({ error: "That network's app keys or LIFTPAGE_TOKEN_KEY aren't set." }, { status: 400 });
  }
  const board = new URL(request.url).searchParams.get("board") ?? "";
  if (!(await loadBrand(board))) return Response.json({ error: "Pick a board." }, { status: 404 });
  const { url, cookie } = authorizeUrl(platform, board);
  (await cookies()).set(OAUTH_COOKIE, JSON.stringify(cookie), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/social",
    maxAge: 600,
  });
  return NextResponse.redirect(url);
}
