import { describe, expect, it } from "vitest";
import { campaignBrief, parseResearch, parseStrategy } from "@/lib/agents/parse";
import { htmlToPage, isPublicAddress, normalizeUrl } from "@/lib/read-site";

describe("isPublicAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "[::1]"])(
    "blocks %s",
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
  it("rejects things that aren't addresses", () => expect(isPublicAddress("example.com")).toBe(false));
});

describe("normalizeUrl", () => {
  it("adds https to a bare domain and drops the fragment", () => {
    expect(normalizeUrl("example.com/pricing#top")?.toString()).toBe("https://example.com/pricing");
  });
  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost:3070",
    "http://127.0.0.1",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com",
    "https://example.com:8080",
    "http://intranet",
    "http://db.internal",
    "",
  ])("refuses %s", (input) => expect(normalizeUrl(input)).toBeNull());
});

describe("htmlToPage", () => {
  const html = `<!doctype html><html><head><title>Acme &amp; Co</title>
    <meta name="description" content="Ship faster.">
    <meta property="og:title" content="Ignored">
    <script>window.secret = "nope"</script><style>.x{}</style></head>
    <body><h1>Deploys in <b>one</b> click</h1><p>Used by 40 teams.</p><!-- hidden --><noscript>enable js</noscript>
    <h2>Pricing</h2><p>From $9&nbsp;a month &#8212; cancel anytime</p></body></html>`;
  const page = htmlToPage(html, "https://acme.test/");
  it("reads title, description, and headings", () => {
    expect(page.title).toBe("Acme & Co");
    expect(page.description).toBe("Ship faster.");
    expect(page.headings).toEqual(["Deploys in one click", "Pricing"]);
  });
  it("keeps visible text and drops scripts, styles, and comments", () => {
    expect(page.text).toContain("Used by 40 teams.");
    expect(page.text).toContain("From $9 a month — cancel anytime");
    expect(page.text).not.toMatch(/secret|\.x\{|hidden|enable js/);
  });
});

const research = JSON.stringify({
  product: "Acme Deploy",
  oneLiner: "One-click deploys for small teams.",
  audience: ["Startup CTOs"],
  painPoints: ["Slow releases"],
  valueProps: ["Fast"],
  proofOnSite: ["Used by 40 teams"],
  competitors: [
    { name: "Rival", url: "https://rival.test/", angle: "Enterprise" },
    { name: "Guessed", url: "https://made-up.test", angle: "Cheap" },
    { name: "", angle: "dropped" },
  ],
  gaps: ["Nobody talks to solo devs"],
});

describe("parseResearch", () => {
  it("reads a model answer wrapped in prose", () => {
    const parsed = parseResearch(`Sure, here it is:\n${research}\nDone.`, ["https://rival.test"]);
    expect(parsed?.product).toBe("Acme Deploy");
    expect(parsed?.competitors).toHaveLength(2);
  });
  it("only marks a competitor provided when we read its page, whatever the model claims", () => {
    const parsed = parseResearch(research, ["https://rival.test"])!;
    expect(parsed.competitors.map((c) => c.source)).toEqual(["provided", "inferred"]);
  });
  it("rejects answers missing the product", () => {
    expect(parseResearch('{"oneLiner":"x"}')).toBeNull();
    expect(parseResearch("not json")).toBeNull();
  });
});

const strategy = JSON.stringify({
  positioning: "The deploy button for teams without a platform engineer.",
  pillars: ["Speed", "Calm", "Proof"],
  channels: [
    { platform: "LinkedIn", why: "CTOs", cadence: "daily" },
    { platform: "myspace", why: "no", cadence: "never" },
  ],
  days: [
    { day: 1, theme: "Demo", objective: "Show it", cta: "Try it" },
    { theme: "Problem", objective: "Name the pain", cta: "Reply" },
    { day: 3, theme: "Proof", objective: "40 teams", cta: "Read" },
  ],
  kpis: ["Site visits"],
});

describe("parseStrategy", () => {
  it("keeps known platforms only and numbers days", () => {
    const parsed = parseStrategy(strategy)!;
    expect(parsed.channels.map((c) => c.platform)).toEqual(["linkedin"]);
    expect(parsed.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });
  it("needs a positioning and at least three days", () => {
    expect(parseStrategy('{"positioning":"x","days":[{"theme":"a"}]}')).toBeNull();
  });
});

describe("campaignBrief", () => {
  it("carries the facts and the week into the cutter's brief", () => {
    const brief = campaignBrief(parseResearch(research)!, parseStrategy(strategy)!, "Beta sign-ups");
    expect(brief).toContain("Acme Deploy");
    expect(brief).toContain("Campaign goal: Beta sign-ups");
    expect(brief).toContain("Used by 40 teams");
    expect(brief).toContain("Day 2: Problem");
    expect(brief.length).toBeLessThanOrEqual(3800);
  });
  it("tells the writer not to claim results when the site shows none", () => {
    const bare = parseResearch(JSON.stringify({ product: "A", oneLiner: "B", proofOnSite: [] }))!;
    expect(campaignBrief(bare, parseStrategy(strategy)!, "")).toContain("Do not claim results.");
  });
});
