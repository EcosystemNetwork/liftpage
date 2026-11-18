import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminOrResponse } from "@/lib/dal";
import { finishConnect, OAUTH_COOKIE, type OAuthState } from "@/lib/social/oauth";
import { siteUrl } from "@/lib/site";
import { PLATFORM_NAME, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request, { params }: RouteContext<"/api/social/[platform]/callback">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const platform = (await params).platform as Platform;
  const url = new URL(request.url);
  const store = await cookies();
  const raw = store.get(OAUTH_COOKIE)?.value;
  store.delete({ name: OAUTH_COOKIE, path: "/api/social" });

  let saved: OAuthState | null = null;
  try {
    saved = raw ? (JSON.parse(raw) as OAuthState) : null;
  } catch {
    saved = null;
  }
  const back = (board: string | undefined, key: "connected" | "connect_error", value: string) => {
    const to = new URL("/desk", siteUrl());
    if (board) to.searchParams.set("board", board);
    to.searchParams.set(key, value);
    return NextResponse.redirect(to);
  };

  const state = url.searchParams.get("state") ?? "";
  if (!saved || saved.platform !== platform || !state || !same(state, saved.state)) {
    return back(saved?.brandId, "connect_error", "The connect link expired or came back changed. Try again.");
  }
  const denied = url.searchParams.get("error_description") || url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (denied || !code) return back(saved.brandId, "connect_error", `${PLATFORM_NAME[platform]} said no: ${denied ?? "no code"}`);
  try {
    const who = await finishConnect(saved, code, admin.id);
    return back(saved.brandId, "connected", `${PLATFORM_NAME[platform]} · ${who.accountName}`);
  } catch (error) {
    console.error("connect", platform, error);
    return back(saved.brandId, "connect_error", error instanceof Error ? error.message.slice(0, 200) : "Connect failed.");
  }
}
