import type { Platform } from "../types";

/**
 * OAuth settings per network. Client ids and secrets come from each network's developer
 * console; the redirect URI to register there is <site>/api/social/<platform>/callback.
 */
export type Provider = {
  platform: Platform;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator: string;
  pkce: boolean;
  /** TikTok calls the client id a client key, and wants it under that name. */
  clientIdParam: string;
  /** How the token endpoint wants the client credentials. */
  clientAuth: "basic" | "body";
  extraAuthorize?: Record<string, string>;
  env: { id: string; secret: string };
};

const linkedinOrg = process.env.LINKEDIN_ORGANIZATION_PAGES === "true";

export const PROVIDERS: Record<Platform, Provider> = {
  x: {
    platform: "x",
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    scopeSeparator: " ",
    pkce: true,
    clientIdParam: "client_id",
    clientAuth: "basic",
    env: { id: "X_CLIENT_ID", secret: "X_CLIENT_SECRET" },
  },
  linkedin: {
    platform: "linkedin",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    // Organization scopes need LinkedIn's Community Management API product. Without it,
    // posts go out as the member who connected, and there are no page insights.
    scopes: linkedinOrg
      ? ["openid", "profile", "w_member_social", "r_organization_social", "w_organization_social", "rw_organization_admin"]
      : ["openid", "profile", "w_member_social"],
    scopeSeparator: " ",
    pkce: false,
    clientIdParam: "client_id",
    clientAuth: "body",
    env: { id: "LINKEDIN_CLIENT_ID", secret: "LINKEDIN_CLIENT_SECRET" },
  },
  instagram: {
    platform: "instagram",
    authorizeUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"],
    scopeSeparator: ",",
    pkce: false,
    clientIdParam: "client_id",
    clientAuth: "body",
    env: { id: "INSTAGRAM_APP_ID", secret: "INSTAGRAM_APP_SECRET" },
  },
  youtube: {
    platform: "youtube",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    scopeSeparator: " ",
    pkce: true,
    clientIdParam: "client_id",
    clientAuth: "body",
    extraAuthorize: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    env: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  },
  tiktok: {
    platform: "tiktok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "user.info.stats", "video.publish", "video.list"],
    scopeSeparator: ",",
    // TikTok's web flow takes no PKCE (its desktop flow hex-encodes the challenge).
    pkce: false,
    clientIdParam: "client_key",
    clientAuth: "body",
    env: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET" },
  },
};

export function credentials(platform: Platform): { id: string; secret: string } | null {
  const p = PROVIDERS[platform];
  const id = process.env[p.env.id];
  const secret = process.env[p.env.secret];
  return id && secret ? { id, secret } : null;
}

/** Networks with app keys set and a token key to seal what they hand back. */
export function connectablePlatforms(): Platform[] {
  if (!process.env.LIFTPAGE_TOKEN_KEY) return [];
  return (Object.keys(PROVIDERS) as Platform[]).filter((platform) => credentials(platform));
}
