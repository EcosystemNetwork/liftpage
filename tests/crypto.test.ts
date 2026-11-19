import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seal, tokenKeyReady, unseal } from "@/lib/social/crypto";

describe("token sealing", () => {
  beforeEach(() => vi.stubEnv("LIFTPAGE_TOKEN_KEY", randomBytes(32).toString("base64")));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips and never stores the plain token", () => {
    const sealed = seal("ya29.secret-token");
    expect(sealed).not.toContain("secret");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(unseal(sealed)).toBe("ya29.secret-token");
  });

  it("uses a fresh IV each time", () => {
    expect(seal("same")).not.toBe(seal("same"));
  });

  it("refuses a tampered token", () => {
    const [v, iv, tag, body] = seal("abc").split(".");
    const flipped = Buffer.from(body, "base64url");
    flipped[0] ^= 1;
    expect(() => unseal([v, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });

  it("refuses a token sealed under another key", () => {
    const sealed = seal("abc");
    vi.stubEnv("LIFTPAGE_TOKEN_KEY", randomBytes(32).toString("base64"));
    expect(() => unseal(sealed)).toThrow();
  });

  it("wants exactly 32 bytes", () => {
    vi.stubEnv("LIFTPAGE_TOKEN_KEY", randomBytes(16).toString("base64"));
    expect(tokenKeyReady()).toBe(false);
    vi.stubEnv("LIFTPAGE_TOKEN_KEY", "");
    expect(tokenKeyReady()).toBe(false);
  });
});
