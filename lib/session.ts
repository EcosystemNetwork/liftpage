import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const SESSION_COOKIE = "lp_session";
export const SESSION_DAYS = 14;

export type SessionClaims = {
  /** user id */
  u: string;
  /** user's sessionVersion when signed */
  v: number;
  /** expiry, epoch ms */
  e: number;
};

let secret: Promise<Buffer> | undefined;

/**
 * LIFTPAGE_SESSION_SECRET in production. In development a random secret is kept in
 * data/session-secret so sessions survive restarts.
 */
function getSecret(): Promise<Buffer> {
  secret ??= (async () => {
    const fromEnv = process.env.LIFTPAGE_SESSION_SECRET;
    if (fromEnv) {
      if (fromEnv.length < 32) throw new Error("LIFTPAGE_SESSION_SECRET must be at least 32 characters.");
      return Buffer.from(fromEnv);
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("Set LIFTPAGE_SESSION_SECRET before running in production.");
    }
    const file = path.join(process.cwd(), "data", "session-secret");
    try {
      return Buffer.from((await readFile(file, "utf8")).trim());
    } catch {
      const value = randomBytes(32).toString("base64url");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, value, { mode: 0o600 });
      return Buffer.from(value);
    }
  })();
  secret.catch(() => {
    secret = undefined;
  });
  return secret;
}

function mac(key: Buffer, body: string): Buffer {
  return createHmac("sha256", key).update(body).digest();
}

export async function signSession(userId: string, version: number): Promise<{ token: string; expires: Date }> {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const claims: SessionClaims = { u: userId, v: version, e: expires.getTime() };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = mac(await getSecret(), body).toString("base64url");
  return { token: `${body}.${sig}`, expires };
}

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let key: Buffer;
  try {
    key = await getSecret();
  } catch (error) {
    // Public pages read the session too; a missing secret means "signed out", not a 500.
    console.error(error);
    return null;
  }
  const expected = mac(key, body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionClaims;
    if (typeof claims.u !== "string" || typeof claims.v !== "number" || typeof claims.e !== "number") return null;
    if (claims.e < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
