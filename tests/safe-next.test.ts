import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/dal";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/account", "/x")).toBe("/account");
    expect(safeNext("/desk?board=b_1#top", "/x")).toBe("/desk?board=b_1#top");
    expect(safeNext("/%09/evil.com", "/x")).toBe("/%09/evil.com");
  });

  it("refuses anything that can leave the site", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com",
      "https://evil.com",
      "evil.com",
      "",
      undefined,
      42,
    ]) {
      expect(safeNext(bad, "/fallback")).toBe("/fallback");
    }
  });
});
