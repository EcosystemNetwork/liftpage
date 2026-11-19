import { describe, expect, it } from "vitest";
import { ownsPath, photoFolder } from "@/lib/client-files";
import { cleanHandle } from "@/lib/handles";

const ME = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const FILE = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("cleanHandle", () => {
  it("keeps a plain handle and drops the @", () => {
    expect(cleanHandle("@rosasbakery")).toBe("rosasbakery");
    expect(cleanHandle("  rosasbakery ")).toBe("rosasbakery");
  });
  it("pulls the handle out of a pasted profile link", () => {
    expect(cleanHandle("https://www.instagram.com/rosasbakery/")).toBe("rosasbakery");
    expect(cleanHandle("instagram.com/rosasbakery?igsh=abc")).toBe("rosasbakery");
    expect(cleanHandle("https://www.tiktok.com/@rosasbakery")).toBe("rosasbakery");
    expect(cleanHandle("https://x.com/rosasbakery")).toBe("rosasbakery");
  });
  it("leaves a page name with spaces alone", () => {
    expect(cleanHandle("Rosa's Bakery")).toBe("Rosa's Bakery");
  });
});

describe("ownsPath", () => {
  it("accepts a file in the client's own folder", () => {
    expect(ownsPath(ME, `${photoFolder(ME)}${FILE}.jpg`)).toBe(true);
  });
  it("refuses another client's folder", () => {
    expect(ownsPath(ME, `${photoFolder(OTHER)}${FILE}.jpg`)).toBe(false);
  });
  it("refuses traversal and nested paths", () => {
    expect(ownsPath(ME, `${photoFolder(ME)}../${OTHER}/${FILE}.jpg`)).toBe(false);
    expect(ownsPath(ME, `${photoFolder(ME)}x/${FILE}.jpg`)).toBe(false);
    expect(ownsPath(ME, `posts/${FILE}.jpg`)).toBe(false);
  });
});
