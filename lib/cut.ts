import { nid } from "./id";
import { futureSlots } from "./time";
import type { Brand, CutVia, Platform, Post } from "./types";
import { PLATFORMS } from "./types";

export type DraftPost = Pick<Post, "platform" | "slot" | "hook" | "caption" | "visual" | "reply">;

const PLATFORM_SET = new Set<string>(PLATFORMS);

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

export function textFromUnknown(data: unknown): string {
  if (typeof data === "string") return data;
  const record = asRecord(data);
  if (!record) return "";
  if (typeof record.output_text === "string") return record.output_text;
  const chunks: string[] = [];
  if (Array.isArray(record.output)) {
    for (const item of record.output) {
      const row = asRecord(item);
      if (!row) continue;
      if (typeof row.text === "string") chunks.push(row.text);
      if (!Array.isArray(row.content)) continue;
      for (const part of row.content) {
        const block = asRecord(part);
        if (block && typeof block.text === "string") chunks.push(block.text);
      }
    }
  }
  if (chunks.length) return chunks.join("\n");
  if (Array.isArray(record.choices)) {
    const choice = asRecord(record.choices[0]);
    const message = choice ? asRecord(choice.message) : null;
    if (message && typeof message.content === "string") return message.content;
  }
  return "";
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
      caption: clip(caption || hook, 1200),
      visual: clip(typeof item.visual === "string" ? item.visual : "The work, full frame.", 240),
      reply: clip(typeof item.reply === "string" ? item.reply : "What did we leave out?", 240),
    });
  });
  if (posts.length < 3) return null;
  return posts.slice(0, 8);
}

function prompt(brand: Brand, brief: string): string {
  return [
    `You are the LiftPage operator for ${brand.name} (${brand.handle}).`,
    `Voice: ${brand.voice}`,
    `Offer: ${brand.offers}`,
    `Platforms: ${brand.platforms.join(", ")}.`,
    "Cut a week of posts from the brief. Each post is native to its platform. Do not resize one caption.",
    "No hashtag walls. No “excited to announce”. No emoji. Keep the facts in the brief. Do not invent metrics.",
    'Return JSON only: {"posts":[{"platform":"x|instagram|tiktok|linkedin|youtube","hook":"","caption":"","visual":"","reply":""}]}',
    "Write 6 posts.",
    "",
    `Brief: ${brief}`,
  ].join("\n");
}

export function safeErr(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[key]")
    .replace(/\b(?:sk|tr|hr)_[A-Za-z0-9_\-]+/g, "[key]")
    .slice(0, 280);
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function postJson(url: string, key: string, body: unknown, label: string): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(100_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    let detail = raw.slice(0, 240);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string }; detail?: string };
      if (parsed.error?.message) detail = parsed.error.message;
      else if (parsed.detail) detail = parsed.detail;
    } catch {
      detail = raw.slice(0, 240);
    }
    throw new Error(`${label} ${response.status}: ${detail}`);
  }
  try {
    return textFromUnknown(JSON.parse(raw)) || raw;
  } catch {
    return raw;
  }
}

async function tokenCut(brand: Brand, brief: string): Promise<string> {
  const base = process.env.TOKENROUTER_BASE_URL;
  const key = process.env.TOKENROUTER_API_KEY;
  if (!base || !key) throw new Error("TokenRouter is not configured");
  const model = process.env.TOKENROUTER_MODEL || "openai/gpt-5-mini";
  return postJson(
    joinUrl(base, "/chat/completions"),
    key,
    {
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: "You return JSON only." },
        { role: "user", content: prompt(brand, brief) },
      ],
    },
    "TokenRouter",
  );
}

async function harnessCut(input: string): Promise<string> {
  const base = process.env.HARNESSROUTER_BASE_URL;
  const key = process.env.HARNESSROUTER_API_KEY;
  if (!base || !key) throw new Error("HarnessRouter is not configured");
  const harness = process.env.HARNESSROUTER_HARNESS_ID || "codex";
  const model = process.env.HARNESSROUTER_MODEL || "gpt-5.4-mini";
  return postJson(
    joinUrl(base, "/v1/responses"),
    key,
    {
      input,
      model,
      stream: false,
      backend: harness,
      metadata: { harness_id: harness },
      max_output_tokens: 2500,
      max_step: 6,
      timeout_seconds: 90,
    },
    "HarnessRouter",
  );
}

export async function cutWeek(
  brief: string,
  brand: Brand,
): Promise<{ posts: Post[]; via: CutVia; note: string }> {
  const slots = futureSlots(8);
  const notes: string[] = [];
  let drafts: DraftPost[] | null = null;
  let via: CutVia = "local";

  const tokenReady = Boolean(process.env.TOKENROUTER_BASE_URL && process.env.TOKENROUTER_API_KEY);
  const harnessReady = Boolean(process.env.HARNESSROUTER_BASE_URL && process.env.HARNESSROUTER_API_KEY);

  if (tokenReady) {
    try {
      drafts = parsePosts(await tokenCut(brand, brief), slots);
      if (drafts) {
        via = "tokenrouter";
        notes.push("TokenRouter cut the week.");
      } else notes.push("TokenRouter answered, but the JSON was unusable.");
    } catch (error) {
      notes.push(`TokenRouter skipped: ${safeErr(error)}`);
    }
  }

  if (!drafts && harnessReady) {
    try {
      drafts = parsePosts(await harnessCut(prompt(brand, brief)), slots);
      if (drafts) {
        via = "harnessrouter";
        notes.push(`HarnessRouter (${process.env.HARNESSROUTER_HARNESS_ID || "codex"}) cut the week.`);
      } else notes.push("HarnessRouter answered, but the JSON was unusable.");
    } catch (error) {
      notes.push(`HarnessRouter skipped: ${safeErr(error)}`);
    }
  }

  if (drafts && harnessReady && via === "tokenrouter") {
    try {
      const reviewed = parsePosts(
        await harnessCut(
          `${prompt(brand, brief)}\n\nTighten this JSON. Keep the facts. Return the same shape.\n${JSON.stringify({ posts: drafts })}`,
        ),
        slots,
      );
      if (reviewed) {
        drafts = reviewed;
        via = "both";
        notes.push(`HarnessRouter (${process.env.HARNESSROUTER_HARNESS_ID || "codex"}) passed the cut.`);
      } else notes.push("HarnessRouter pass returned unusable JSON. Kept the TokenRouter cut.");
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
