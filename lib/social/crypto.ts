import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** LIFTPAGE_TOKEN_KEY: 32 random bytes, base64. `openssl rand -base64 32` */
function key(): Buffer {
  const raw = process.env.LIFTPAGE_TOKEN_KEY;
  if (!raw) throw new Error("Set LIFTPAGE_TOKEN_KEY before connecting network accounts.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("LIFTPAGE_TOKEN_KEY must be 32 bytes, base64.");
  return buf;
}

export function tokenKeyReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** AES-256-GCM. v1.iv.tag.ciphertext, base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Token is not sealed with this app's format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
