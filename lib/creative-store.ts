import "server-only";
import { complete } from "./ai";
import { NO_INVENTION } from "./agents/parse";
import { cleanKit, parseCarousel, parseVideoScript, type BrandKit, type Carousel, type VideoScript } from "./creative";
import { nid } from "./id";
import { db, must } from "./supabase/server";
import type { Brand, Platform } from "./types";
import { metered } from "./usage";
import type { Usage } from "./usage-format";

type Row = Record<string, unknown>;

export type Creative =
  | { id: string; brandId: string; kind: "carousel"; title: string; brief: string; data: Carousel; via: string; usage?: Usage; createdAt: string }
  | { id: string; brandId: string; kind: "video"; title: string; brief: string; data: VideoScript; via: string; usage?: Usage; createdAt: string };

export const CREATIVE_KINDS = ["carousel", "video"] as const;
export type CreativeKind = (typeof CREATIVE_KINDS)[number];

export async function loadKit(brandId: string): Promise<BrandKit> {
  const row = must(await db().from("brands").select("kit").eq("id", brandId).maybeSingle(), "load brand kit") as Row | null;
  return cleanKit(row?.kit);
}

export async function saveKit(brandId: string, kit: BrandKit) {
  must(await db().from("brands").update({ kit: cleanKit(kit) }).eq("id", brandId), "save brand kit");
}

function toCreative(row: Row): Creative {
  return {
    id: row.id as string,
    brandId: row.brand_id as string,
    kind: row.kind as CreativeKind,
    title: (row.title as string) ?? "",
    brief: (row.brief as string) ?? "",
    data: row.data as Carousel & VideoScript,
    via: (row.via as string) ?? "",
    usage: (row.usage as Usage | null) ?? undefined,
    createdAt: row.created_at as string,
  } as Creative;
}

export async function listCreatives(brandId: string, limit = 30): Promise<Creative[]> {
  const rows = must(await db().from("creatives").select("*").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(limit), "list creatives") as Row[];
  return rows.map(toCreative);
}

export async function deleteCreative(id: string) {
  must(await db().from("creatives").delete().eq("id", id), "delete creative");
}

function brandLines(brand: Brand): string {
  return [`Brand: ${brand.name} (${brand.handle}).`, `Voice: ${brand.voice}`, brand.offers ? `What they sell: ${brand.offers}` : ""].filter(Boolean).join("\n");
}

const CAROUSEL_ASK = [
  "Write a swipeable carousel (6–8 slides).",
  "Slide 1 is the cover: a heading that stops the scroll (under 60 characters), body optional.",
  "Middle slides teach or show one idea each: heading under 60 characters, body under 200 characters. Concrete, no filler.",
  "The last slide is the ask: one plain call to action.",
  "Also write the post caption to go with it.",
  'Return JSON only: {"title":"","slides":[{"heading":"","body":""}],"caption":""}',
].join("\n");

const VIDEO_ASK = [
  "Write a short-form vertical video script (TikTok, Reels, Shorts), 30–60 seconds.",
  "`hook` is the first 2 seconds, said and shown. `beats` are timestamped (\"0:03\"), each with what's said, the on-screen text (under 8 words), and the shot (what the camera sees, shootable on a phone).",
  "End on one plain call to action. Then the caption, with at most 3 hashtags.",
  'Return JSON only: {"title":"","hook":"","seconds":45,"beats":[{"at":"0:00","say":"","onScreen":"","shot":""}],"caption":""}',
].join("\n");

/** Writes one creative with the brand's voice and saves it. */
export async function makeCreative(input: { brand: Brand; kind: CreativeKind; brief: string; platform?: Platform }): Promise<Creative | { error: string }> {
  const parse = input.kind === "carousel" ? parseCarousel : parseVideoScript;
  const ask = [
    `You are LiftPage's creative director.`,
    brandLines(input.brand),
    input.platform ? `It's for ${input.platform}.` : "",
    input.kind === "carousel" ? CAROUSEL_ASK : VIDEO_ASK,
    NO_INVENTION,
    "",
    `Brief:\n${input.brief}`,
  ]
    .filter(Boolean)
    .join("\n");
  // complete() reports backend failures as { error }, not by throwing.
  const result = await metered(() =>
    complete(ask, { system: "You are a senior social creative. You return JSON only.", temperature: 0.6, maxOutputTokens: 2500, accept: (text) => parse(text) !== null }),
  );
  const answer = result.value;
  if ("error" in answer) return { error: answer.error };
  const data = parse(answer.text)!;
  const row = {
    id: nid("crt"),
    brand_id: input.brand.id,
    kind: input.kind,
    title: data.title.slice(0, 200),
    brief: input.brief.slice(0, 4000),
    data,
    via: answer.via,
    usage: result.usage,
  };
  must(await db().from("creatives").insert(row), "save creative");
  return toCreative({ ...row, created_at: new Date().toISOString() });
}

/** Draft posts a slide can be attached to: still drafts, not scheduled. */
export async function draftsFor(brandId: string): Promise<{ id: string; platform: Platform; hook: string }[]> {
  const rows = must(
    await db().from("posts").select("id, platform, hook").eq("brand_id", brandId).eq("status", "draft").eq("publish_state", "idle").order("slot").limit(100),
    "load drafts",
  ) as Row[];
  return rows.map((row) => ({ id: row.id as string, platform: row.platform as Platform, hook: (row.hook as string) ?? "" }));
}
