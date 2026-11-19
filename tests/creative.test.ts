import { describe, expect, it } from "vitest";
import { cleanKit, contrast, DEFAULT_KIT, parseCarousel, parseVideoScript, renderSlide, wrap } from "@/lib/creative";

describe("cleanKit", () => {
  it("falls back to defaults on junk", () => {
    expect(cleanKit(null)).toEqual(DEFAULT_KIT);
    expect(cleanKit({ background: "red", font: "comic" })).toEqual(DEFAULT_KIT);
  });
  it("expands short hex and caps the signature", () => {
    const kit = cleanKit({ background: "#FFF", text: "#000", accent: "#0a0", signature: "x".repeat(99) });
    expect(kit).toMatchObject({ background: "#ffffff", text: "#000000", accent: "#00aa00" });
    expect(kit.signature).toHaveLength(40);
  });
  it("swaps unreadable text for black or white", () => {
    expect(cleanKit({ background: "#ffffff", text: "#eeeeee" }).text).toBe("#000000");
    expect(cleanKit({ background: "#111111", text: "#222222" }).text).toBe("#ffffff");
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
  });
});

describe("parseCarousel", () => {
  const slides = (n: number) => Array.from({ length: n }, (_, i) => ({ heading: `H${i}`, body: "b" }));
  it("needs at least four slides with headings, keeps at most ten", () => {
    expect(parseCarousel(JSON.stringify({ slides: slides(3) }))).toBeNull();
    expect(parseCarousel(JSON.stringify({ slides: [...slides(3), { heading: "", body: "x" }] }))).toBeNull();
    const parsed = parseCarousel(`Here: ${JSON.stringify({ title: "T", slides: slides(14), caption: "C" })}`)!;
    expect(parsed.slides).toHaveLength(10);
    expect(parsed.caption).toBe("C");
  });
  it("uses the cover as the title when none is given", () => {
    expect(parseCarousel(JSON.stringify({ slides: slides(4) }))!.title).toBe("H0");
  });
});

describe("parseVideoScript", () => {
  const beats = [
    { at: "0:00", say: "a", onScreen: "A", shot: "face" },
    { at: "0:05", say: "b", onScreen: "", shot: "screen" },
    { at: "0:10", say: "", onScreen: "C", shot: "" },
    { at: "0:15", say: "", onScreen: "", shot: "dropped" },
  ];
  it("needs a hook and three usable beats; bounds the length", () => {
    const parsed = parseVideoScript(JSON.stringify({ hook: "Stop shipping on Fridays", beats, seconds: 999 }))!;
    expect(parsed.beats).toHaveLength(3);
    expect(parsed.seconds).toBe(45);
    expect(parseVideoScript(JSON.stringify({ hook: "", beats }))).toBeNull();
  });
});

describe("wrap", () => {
  it("fits lines to the width and hard-breaks long words", () => {
    const lines = wrap("supercalifragilisticexpialidocious is long", 100, 550, 10);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
    expect(lines.join("")).toContain("supercalif");
  });
  it("ends an overflow with an ellipsis", () => {
    const lines = wrap("one two three four five six seven eight nine ten", 100, 550, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
});

describe("renderSlide", () => {
  const kit = cleanKit({ background: "#101010", text: "#fafafa", accent: "#ff5500", signature: "@acme" });
  it("draws a well-formed 4:5 SVG in the kit's colours", () => {
    const svg = renderSlide(kit, { heading: "Ship on Fridays", body: "Here's how." }, 0, 6);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"')).toBe(true);
    expect(svg).toContain('fill="#101010"');
    expect(svg).toContain("@acme");
    expect(svg).toContain("1/6");
    expect(svg).toContain("Swipe");
  });
  it("escapes text so a model can't inject markup", () => {
    const svg = renderSlide(kit, { heading: '<script>alert("x")</script> & co', body: "" }, 5, 6);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("Swipe");
  });
});
