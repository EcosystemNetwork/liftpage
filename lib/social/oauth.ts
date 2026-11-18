import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "../site";
import { db, must } from "../supabase/server";
import type { Platform } from "../types";
import { seal, unseal } from "./crypto";
import { credentials, PROVIDERS } from "./providers";

export const OAUTH_COOKIE = "lp_oauth";

export const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || "202610";

export class SocialError extends Error {
  constructor(
    public platform: Platform,
    message: string,
  ) {
    super(message);
    this.name = "SocialError";
  }
}

/** fetch → JSON, with the network's own error text when it says no. */
export async function call<T = Record<string, unknown>>(platform: Platform, url: string, init: RequestInit = {}): Promise<{ body: T; headers: Headers }> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
  const raw = await response.text();
  let body: unknown = raw;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // Not JSON. Keep the text for the error.
  }
  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new SocialError(platform, `${response.status} ${detail.slice(0, 300)}`);
  }
  return { body: body as T, headers: response.headers };
}

export function redirectUri(platform: Platform): string {
  return `${siteUrl()}/api/social/${platform}/callback`;
}

export type OAuthState = { state: string; verifier?: string; brandId: string; platform: Platform };

/** The authorize URL, plus what the callback needs to check it came back from us. */
export function authorizeUrl(platform: Platform, brandId: string): { url: string; cookie: OAuthState } {
  const provider = PROVIDERS[platform];
  const creds = credentials(platform);
  if (!creds) throw new SocialError(platform, `Set ${provider.env.id} and ${provider.env.secret} first.`);
  const state = randomBytes(24).toString("base64url");
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set(provider.clientIdParam, creds.id);
  url.searchParams.set("redirect_uri", redirectUri(platform));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(provider.scopeSeparator));
  url.searchParams.set("state", state);
  let verifier: string | undefined;
  if (provider.pkce) {
    verifier = randomBytes(48).toString("base64url");
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.extraAuthorize ?? {})) url.searchParams.set(k, v);
  return { url: url.toString(), cookie: { state, verifier, brandId, platform } };
}

type TokenSet = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(platform: Platform, params: Record<string, string>): Promise<TokenSet> {
  const provider = PROVIDERS[platform];
  const creds = credentials(platform);
  if (!creds) throw new SocialError(platform, "App keys are gone from the environment.");
  const form = new URLSearchParams(params);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (provider.clientAuth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`;
    form.set("client_id", creds.id);
  } else {
    form.set(provider.clientIdParam, creds.id);
    form.set("client_secret", creds.secret);
  }
  const { body } = await call<Record<string, unknown>>(platform, provider.tokenUrl, { method: "POST", headers, body: form });
  // Instagram's short-lived exchange sometimes wraps the answer in data[].
  const set = (Array.isArray(body.data) ? body.data[0] : body) as TokenSet;
  if (!set?.access_token) throw new SocialError(platform, "No access token in the answer.");
  return set;
}

type Identity = { accountId: string; accountName: string };

async function identify(platform: Platform, token: string): Promise<Identity> {
  const bearer = { Authorization: `Bearer ${token}` };
  switch (platform) {
    case "x": {
      const { body } = await call<{ data: { id: string; username: string } }>(platform, "https://api.x.com/2/users/me", { headers: bearer });
      return { accountId: body.data.id, accountName: `@${body.data.username}` };
    }
    case "linkedin": {
      if (process.env.LINKEDIN_ORGANIZATION_PAGES === "true") {
        const headers = { ...bearer, "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" };
        const { body } = await call<{ elements: { organization: string }[] }>(
          platform,
          "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
          { headers },
        );
        const org = body.elements[0]?.organization;
        if (!org) throw new SocialError(platform, "That LinkedIn member doesn't administer a company page.");
        const id = org.split(":").pop();
        const named = await call<{ localizedName?: string }>(platform, `https://api.linkedin.com/rest/organizations/${id}`, { headers }).catch(() => null);
        return { accountId: org, accountName: named?.body.localizedName ?? `Page ${id}` };
      }
      const { body } = await call<{ sub: string; name?: string }>(platform, "https://api.linkedin.com/v2/userinfo", { headers: bearer });
      return { accountId: `urn:li:person:${body.sub}`, accountName: body.name ?? "LinkedIn member" };
    }
    case "instagram": {
      const { body } = await call<{ user_id: string; username: string }>(
        platform,
        `https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`,
      );
      return { accountId: String(body.user_id), accountName: `@${body.username}` };
    }
    case "youtube": {
      const { body } = await call<{ items?: { id: string; snippet: { title: string } }[] }>(
        platform,
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: bearer },
      );
      const channel = body.items?.[0];
      if (!channel) throw new SocialError(platform, "That Google account has no YouTube channel.");
      return { accountId: channel.id, accountName: channel.snippet.title };
    }
    case "tiktok": {
      const { body } = await call<{ data: { user: { open_id: string; display_name: string } } }>(
        platform,
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
        { headers: bearer },
      );
      return { accountId: body.data.user.open_id, accountName: body.data.user.display_name };
    }
  }
}

function expiry(seconds?: number): string | null {
  return seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
}

/** Trades the callback's code for tokens, names the account, and stores it sealed. */
export async function finishConnect(saved: OAuthState, code: string, userId: string): Promise<Identity> {
  const platform = saved.platform;
  const params: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: redirectUri(platform) };
  if (saved.verifier) params.code_verifier = saved.verifier;
  let set = await tokenRequest(platform, params);

  if (platform === "instagram") {
    // The code buys a one-hour token. Trade it for the 60-day one.
    const creds = credentials(platform)!;
    const { body } = await call<{ access_token: string; expires_in: number }>(
      platform,
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(creds.secret)}&access_token=${encodeURIComponent(set.access_token)}`,
    );
    set = { access_token: body.access_token, expires_in: body.expires_in };
  }

  const who = await identify(platform, set.access_token);
  must(
    await db().from("social_accounts").upsert(
      {
        brand_id: saved.brandId,
        platform,
        account_id: who.accountId,
        account_name: who.accountName,
        access_token: seal(set.access_token),
        refresh_token: set.refresh_token ? seal(set.refresh_token) : null,
        expires_at: expiry(set.expires_in),
        scope: set.scope ?? null,
        connected_at: new Date().toISOString(),
        connected_by: userId,
      },
      { onConflict: "brand_id,platform" },
    ),
    "save connection",
  );
  return who;
}

export type Account = { brandId: string; platform: Platform; accountId: string; accountName: string; token: string };

/** A live access token for the board's account on this network, refreshed when close to expiry. */
export async function accountFor(brandId: string, platform: Platform): Promise<Account> {
  const row = must(
    await db().from("social_accounts").select("*").eq("brand_id", brandId).eq("platform", platform).maybeSingle(),
    "load connection",
  ) as Record<string, string | null> | null;
  if (!row) throw new SocialError(platform, "Not connected. Connect the account on the desk first.");
  const base = { brandId, platform, accountId: row.account_id!, accountName: row.account_name ?? "" };
  const expires = row.expires_at ? Date.parse(row.expires_at) : Infinity;
  const soon = expires - Date.now() < 5 * 60_000;
  if (!soon) return { ...base, token: unseal(row.access_token!) };
  return { ...base, token: await refresh(brandId, platform, row) };
}

/** Instagram tokens refresh themselves; everyone else uses the refresh token. */
export async function refresh(brandId: string, platform: Platform, row: Record<string, string | null>): Promise<string> {
  let set: TokenSet;
  if (platform === "instagram") {
    const current = unseal(row.access_token!);
    const { body } = await call<{ access_token: string; expires_in: number }>(
      platform,
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`,
    );
    set = { access_token: body.access_token, expires_in: body.expires_in };
  } else {
    if (!row.refresh_token) throw new SocialError(platform, "The connection expired. Reconnect it on the desk.");
    set = await tokenRequest(platform, { grant_type: "refresh_token", refresh_token: unseal(row.refresh_token) });
  }
  must(
    await db()
      .from("social_accounts")
      .update({
        access_token: seal(set.access_token),
        // Google doesn't send a new refresh token; keep the one we have.
        refresh_token: set.refresh_token ? seal(set.refresh_token) : row.refresh_token,
        expires_at: expiry(set.expires_in),
      })
      .eq("brand_id", brandId)
      .eq("platform", platform),
    "save refreshed token",
  );
  return set.access_token;
}

export async function disconnect(brandId: string, platform: Platform) {
  must(await db().from("social_accounts").delete().eq("brand_id", brandId).eq("platform", platform), "disconnect");
}
