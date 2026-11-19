import { askHarnessRouter, askTokenRouter, complete, harnessName, harnessReady, safeErr, tokenReady, type AiVia } from "./ai";
import { nid } from "./id";
import { futureSlots } from "./time";
import type { Brand, CutVia, Platform, Post } from "./types";
import { PLATFORMS } from "./types";

export type DraftPost = Pick<Post, "platform" | "slot" | "hook" | "caption" | "visual" | "reply">;

const PLATFORM_SET = new Set<string>(PLATFORMS);

export { safeErr, textFromUnknown } from "./ai";

/** The most a caption can be and still publish. X is the hard one: 280, counted by code point. */
export const CAPTION_LIMIT: Record<Platform, number> = { x: 280, instagram: 2200, tiktok: 2200, linkedin: 3000, youtube: 5000 };


/** Clips to the network's limit, counting the way X does (code points), leaving room for the ellipsis. */
export function fitCaption(platform: Platform, caption: string): string {
  const limit = Math.min(CAPTION_LIMIT[platform], 1200);
  const chars = [...caption.trim()];
  if (chars.length <= limit) return caption.trim();
  return `${chars.slice(0, limit - 1).join("").trimEnd()}…`;
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function sentences(brief: string): string[] {
  return brief
    .split(/[\n.!?]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 6);
}

function firstWords(value: string, count: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= count) return words.join(" ");
  return words.slice(0, count).join(" ");
}

function shape(platform: Platform, beat: string, follow: string, brand: Brand, slot: string): DraftPost {
  const line = clip(beat, 220);
  const next = clip(follow, 180);
  if (platform === "x") {
    return {
      platform,
      slot,
      hook: clip(line, 90),
      caption: clip(line, 240),
      visual: "No image. The line has to hold.",
      reply: next || "What did we leave out?",
    };
  }
  if (platform === "instagram") {
    return {
      platform,
      slot,
      hook: clip(firstWords(line, 8), 70),
      caption: `${clip(line, 160)}\n\n${brand.name}. ${clip(brand.offers, 90)}`,
      visual: `One frame: ${clip(line, 80)}. No logo in the corner.`,
      reply: next || "Which frame do you want first?",
    };
  }
  if (platform === "linkedin") {
    return {
      platform,
      slot,
      hook: clip(firstWords(line, 10), 80),
      caption: `${line}\n\n${next}\n\n${brand.name} — ${clip(brand.offers, 100)}`,
      visual: "The work on a desk. No stock photo of a meeting.",
      reply: "If this is the job, send the brief.",
    };
  }
  if (platform === "tiktok") {
    return {
      platform,
      slot,
      hook: clip(firstWords(line, 6), 42),
      caption: clip(line, 100),
      visual: `Handheld. First frame is "${clip(firstWords(line, 6), 42)}". Cut on the verb.`,
      reply: "Comment the line you'd actually say.",
    };
  }
  return {
    platform,
    slot,
    hook: clip(firstWords(line, 8), 70),
    caption: `${clip(line, 160)}\n\nDrop the one thing you want cut this week.`,
    visual: "Community card. The hook is the whole frame.",
    reply: next || "Reply with the brief.",
  };
}

export function localCut(brief: string, brand: Brand, now = new Date()): DraftPost[] {
  const beats = sentences(brief);
  const lines = beats.length
    ? beats
    : [`${brand.name} ships the work, then talks about it`, brand.offers, brand.voice];
  const list = brand.platforms.length ? brand.platforms : (["x"] as Platform[]);
  const count = Math.min(6, Math.max(4, lines.length));
  const slots = futureSlots(count, now);
  return Array.from({ length: count }, (_, index) =>
    shape(
      list[index % list.length],
      lines[index % lines.length],
      lines[(index + 1) % lines.length],
      brand,
      slots[index] ?? slots[slots.length - 1],
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function platformOf(value: unknown): Platform | null {
  if (typeof value !== "string") return null;
  const name = value.toLowerCase().replace(/\s+/g, "");
  if (name === "twitter") return "x";
  if (PLATFORM_SET.has(name)) return name as Platform;
  return null;
}

export function parsePosts(text: string, slots: string[]): DraftPost[] | null {
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  let parsed: unknown;
  try {
    if (objectStart >= 0 && objectEnd > objectStart) {
      parsed = JSON.parse(text.slice(objectStart, objectEnd + 1));
    } else if (arrayStart >= 0 && arrayEnd > arrayStart) {
      parsed = JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed) ? parsed : asRecord(parsed)?.posts;
  if (!Array.isArray(rows)) return null;
  const posts: DraftPost[] = [];
  rows.forEach((row, index) => {
    const item = asRecord(row);
    if (!item) return;
    const platform = platformOf(item.platform);
    const caption = typeof item.caption === "string" ? item.caption.trim() : "";
    const hook = typeof item.hook === "string" ? item.hook.trim() : "";
    if (!platform || (!caption && !hook)) return;
    const slot = slots[index] ?? slots[slots.length - 1];
    if (!slot) return;
    posts.push({
      platform,
      slot,
      hook: clip(hook || caption, 120),
      caption: fitCaption(platform, caption || hook),
      visual: clip(typeof item.visual === "string" && item.visual.trim() ? item.visual : "The work, full frame.", 400),
      reply: clip(typeof item.reply === "string" && item.reply.trim() ? item.reply : "What did we leave out?", 240),
    });
  });
  if (posts.length < 3) return null;
  return posts.slice(0, 8);
}

function platformRules(platforms: Platform[]): string[] {
  const rules = [
    "X: the caption is at most 270 characters, one idea, no thread numbering.",
    "LinkedIn: short paragraphs, the first line earns the click, end on a question or a plain ask.",
    "Instagram: the hook is the first line of the caption; for a Reel the visual is a shot list.",
    "TikTok and YouTube Shorts: the visual is a timed shot list for a 20–40 second video, e.g. \"0–3s: … / 3–10s: … / 10–25s: … / end card: …\", under 400 characters.",
    "reply is the first comment or reply the brand posts under its own post.",
  ];
  const keep = new Set(platforms);
  return rules.filter((rule) =>
    rule.startsWith("reply") ||
    (rule.startsWith("X") && keep.has("x")) ||
    (rule.startsWith("LinkedIn") && keep.has("linkedin")) ||
    (rule.startsWith("Instagram") && keep.has("instagram")) ||
    (rule.startsWith("TikTok") && (keep.has("tiktok") || keep.has("youtube"))),
  );
}

function brandLines(brand: Brand): string[] {
  return [
    `You are the LiftPage operator for ${brand.name} (${brand.handle}).`,
    `Voice: ${brand.voice}`,
    `Offer: ${brand.offers}`,
    `Platforms: ${brand.platforms.join(", ")}.`,
  ];
}

const HOUSE_RULES = "No hashtag walls. No “excited to announce”. No emoji. Keep the facts in the brief. Do not invent metrics, customers, quotes, or dates.";

function prompt(brand: Brand, brief: string): string {
  return [
    ...brandLines(brand),
    "Cut a week of posts from the brief. Each post is native to its platform. Do not resize one caption.",
    HOUSE_RULES,
    ...platformRules(brand.platforms),
    'Return JSON only: {"posts":[{"platform":"x|instagram|tiktok|linkedin|youtube","hook":"","caption":"","visual":"","reply":""}]}',
    "Write 6 posts.",
    "",
    `Brief: ${brief}`,
  ].join("\n");
}

export async function cutWeek(
  brief: string,
  brand: Brand,
): Promise<{ posts: Post[]; via: CutVia; note: string }> {
  const slots = futureSlots(8);
  const notes: string[] = [];
  let drafts: DraftPost[] | null = null;
  let via: CutVia = "local";

  if (harnessReady()) {
    try {
      drafts = parsePosts(await askHarnessRouter(prompt(brand, brief)), slots);
      if (drafts) {
        via = "harnessrouter";
        notes.push(`HarnessRouter (${harnessName()}) cut the week.`);
      } else notes.push("HarnessRouter answered, but the JSON was unusable.");
    } catch (error) {
      notes.push(`HarnessRouter skipped: ${safeErr(error)}`);
    }
  }

  if (!drafts && tokenReady()) {
    try {
      drafts = parsePosts(await askTokenRouter(prompt(brand, brief)), slots);
      if (drafts) {
        via = "tokenrouter";
        notes.push("TokenRouter cut the week.");
      } else notes.push("TokenRouter answered, but the JSON was unusable.");
    } catch (error) {
      notes.push(`TokenRouter skipped: ${safeErr(error)}`);
    }
  }

  if (drafts && harnessReady() && via !== "local") {
    try {
      const reviewed = parsePosts(
        await askHarnessRouter(
          `${prompt(brand, brief)}\n\nTighten this JSON. Keep the facts. Return the same shape.\n${JSON.stringify({ posts: drafts })}`,
        ),
        slots,
      );
      if (reviewed) {
        drafts = reviewed;
        if (via === "tokenrouter") via = "both";
        notes.push(`HarnessRouter (${harnessName()}) passed the cut.`);
      } else notes.push("HarnessRouter pass returned unusable JSON. Kept the first cut.");
    } catch (error) {
      notes.push(`HarnessRouter pass skipped: ${safeErr(error)}`);
    }
  }

  if (!drafts) {
    drafts = localCut(brief, brand);
    via = "local";
    notes.push("Local operator cut the week on this machine.");
  }

  return {
    via,
    note: notes.join(" "),
    posts: drafts.map((draft) => ({ ...draft, id: nid("p"), status: "draft" as const, publishState: "idle" as const, notes: [] })),
  };
}

export type Revision = Pick<Post, "hook" | "caption" | "visual" | "reply">;

/** Reads one rewritten post out of a model answer, held to the network's limits. */
export function parseRevision(text: string, platform: Platform): Revision | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!value || typeof value !== "object") return null;
    parsed = value as Record<string, unknown>;
    if (parsed.post && typeof parsed.post === "object") parsed = parsed.post as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (key: string) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "");
  const caption = str("caption");
  if (!caption) return null;
  return {
    hook: clip(str("hook") || caption, 120),
    caption: fitCaption(platform, caption),
    visual: clip(str("visual") || "The work, full frame.", 400),
    reply: clip(str("reply") || "What did we leave out?", 240),
  };
}

/**
 * Rewrites one post against its review notes: the client's change requests first, then any
 * comments. Returns the new lines, or an error that says which backend failed.
 */
export async function revisePost(
  post: Post,
  brand: Brand,
  extra = "",
): Promise<{ revision: Revision; via: AiVia; note: string } | { error: string }> {
  const asks = post.notes
    .filter((note) => note.kind !== "approved" && note.text.trim())
    .map((note) => `- ${note.role === "client" ? "Client" : "LiftPage"} (${note.kind === "changes" ? "asked for changes" : "comment"}): ${note.text.trim()}`);
  if (!asks.length && !extra.trim()) return { error: "There is nothing to revise against. Add a note first." };
  const ask = [
    ...brandLines(brand),
    `Rewrite this ${post.platform} post so it answers the review notes. Keep what nobody asked to change.`,
    HOUSE_RULES,
    ...platformRules([post.platform]),
    'Return JSON only: {"hook":"","caption":"","visual":"","reply":""}',
    "",
    `Post: ${JSON.stringify({ hook: post.hook, caption: post.caption, visual: post.visual, reply: post.reply })}`,
    "",
    "Review notes, oldest first:",
    ...asks,
    extra.trim() ? `- LiftPage (instruction): ${extra.trim()}` : "",
  ].join("\n");
  const answer = await complete(ask, { accept: (text) => parseRevision(text, post.platform) !== null });
  if ("error" in answer) return { error: answer.error };
  const revision = parseRevision(answer.text, post.platform)!;
  const name = answer.via === "tokenrouter" ? "TokenRouter" : `HarnessRouter (${harnessName()})`;
  return { revision, via: answer.via, note: [...answer.notes, `${name} redrafted the post.`].join(" ") };
}
