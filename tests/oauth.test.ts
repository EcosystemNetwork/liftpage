import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeUrl } from "@/lib/social/oauth";
import { connectablePlatforms } from "@/lib/social/providers";

describe("OAuth authorize URLs", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://liftpage.test");
    vi.stubEnv("X_CLIENT_ID", "x-id");
    vi.stubEnv("X_CLIENT_SECRET", "x-secret");
    vi.stubEnv("TIKTOK_CLIENT_KEY", "tt-key");
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "tt-secret");
    vi.stubEnv("INSTAGRAM_APP_ID", "");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("X: PKCE S256 that matches the stored verifier, and the callback on our site", () => {
    const { url, cookie } = authorizeUrl("x", "brand_1");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(u.searchParams.get("client_id")).toBe("x-id");
    expect(u.searchParams.get("redirect_uri")).toBe("https://liftpage.test/api/social/x/callback");
    expect(u.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(createHash("sha256").update(cookie.verifier!).digest("base64url"));
    expect(u.searchParams.get("state")).toBe(cookie.state);
    expect(cookie).toMatchObject({ brandId: "brand_1", platform: "x" });
    expect(url).not.toContain("x-secret");
  });

  it("TikTok: client_key, comma scopes, no PKCE", () => {
    const u = new URL(authorizeUrl("tiktok", "b").url);
    expect(u.searchParams.get("client_key")).toBe("tt-key");
    expect(u.searchParams.get("client_id")).toBeNull();
    expect(u.searchParams.get("scope")).toContain("video.publish,");
    expect(u.searchParams.get("code_challenge")).toBeNull();
  });

  it("each connect gets its own state", () => {
    expect(authorizeUrl("x", "b").cookie.state).not.toBe(authorizeUrl("x", "b").cookie.state);
  });

  it("refuses a network without keys", () => {
    expect(() => authorizeUrl("instagram", "b")).toThrow(/INSTAGRAM_APP_ID/);
  });

  it("only lists networks that are connectable, and none without the token key", () => {
    vi.stubEnv("LIFTPAGE_TOKEN_KEY", "");
    expect(connectablePlatforms()).toEqual([]);
    vi.stubEnv("LIFTPAGE_TOKEN_KEY", randomBytes(32).toString("base64"));
    expect(connectablePlatforms().sort()).toEqual(["tiktok", "x"]);
  });
});
