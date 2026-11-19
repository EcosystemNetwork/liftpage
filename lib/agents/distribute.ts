import { createHash } from "node:crypto";
import { addDays, ptYMD, zonedISO } from "../time";
import type { Platform } from "../types";

/*
 * The distribution agent's plan, as pure functions: where each draft lands in the week and
 * which tracked link it carries. No model call, so it's cheap, repeatable, and testable.
 * It never schedules anything: posts stay drafts until a person approves and cues them.
 */

/** Pacific-time posting windows per network, best first. Rotated so posts don't stack. */
export const WINDOWS: Record<Platform, [number, number][]> = {
  x: [[8, 30], [12, 15], [17, 30]],
  linkedin: [[8, 10], [12, 5], [17, 15]],
  instagram: [[11, 30], [19, 0], [8, 45]],
  tiktok: [[19, 30], [12, 30], [16, 0]],
  youtube: [[15, 0], [11, 0], [18, 0]],
};

/** Networks where a link in the caption isn't clickable; the operator uses the bio link. */
export const BIO_LINK: ReadonlySet<Platform> = new Set<Platform>(["instagram", "tiktok"]);

export const UTM_SOURCE: Record<Platform, string> = { x: "x", linkedin: "linkedin", instagram: "instagram", tiktok: "tiktok", youtube: "youtube" };

export type PlanPost = { id: string; platform: Platform; slot: string; caption: string };

export type Placement = {
  postId: string;
  platform: Platform;
  day: number;
  slot: string;
  /** utm_content, unique per post inside the campaign. */
  content: string;
  link: string;
  /** Where the tracked link went: into the caption, the bio, or nowhere it fits. */
  linkPlacement: "caption" | "bio" | "manual";
  caption: string;
};

/**
 * A campaign tag that's stable for the campaign but doesn't expose its id: the id is what
 * reads the campaign's research, and UTM tags end up in public links and analytics tools.
 */
export function campaignTag(campaignId: string, createdAt: string): string {
  const day = createdAt.slice(0, 10).replace(/-/g, "");
  const hash = createHash("sha256").update(campaignId).digest("hex").slice(0, 6);
  return `lp-${day}-${hash}`;
}

/** The landing URL with UTM tags. Existing query params are kept; old utm_* are replaced. */
export function utmLink(url: string, tags: { source: string; medium: string; campaign: string; content?: string }): string {
  const link = new URL(url);
  for (const key of [...link.searchParams.keys()]) if (key.startsWith("utm_")) link.searchParams.delete(key);
  link.searchParams.set("utm_source", tags.source);
  link.searchParams.set("utm_medium", tags.medium);
  link.searchParams.set("utm_campaign", tags.campaign);
  if (tags.content) link.searchParams.set("utm_content", tags.content);
  return link.toString();
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Swaps every mention of the landing page (with or without scheme, www, or trailing slash)
 * for the tracked link. Returns null when the caption doesn't mention it.
 */
export function tagLinks(text: string, landing: string, tracked: string): string | null {
  const url = new URL(landing);
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  // Not inside a longer host (sub.acme.com, acme.com.evil) or a deeper path (acme.com/blog).
  const source = `(?<![\\w.@/-])(?:https?://)?(?:www\\.)?${escape(host)}${escape(path)}/?(?:\\?[^\\s)\\]]*)?(?![\\w/-]|\\.[\\w])`;
  if (!new RegExp(source, "i").test(text)) return null;
  return text.replace(new RegExp(source, "gi"), tracked);
}

/** Next `n` days starting tomorrow (PT), as {y,m,d}. */
function campaignDays(n: number, now: Date) {
  const today = ptYMD(now);
  return Array.from({ length: n }, (_, index) => addDays(today.y, today.m, today.d, index + 1));
}

/**
 * Spreads drafts over the strategy's days in their current order, each at its network's
 * next free window, and tags its link. `limits` keeps a tagged caption inside the network's
 * length limit; one that won't fit keeps its caption and the link is listed for by-hand use.
 */
export function planDistribution(input: {
  posts: PlanPost[];
  landing: string;
  campaign: string;
  days: number;
  limits: Record<Platform, number>;
  now?: Date;
}): Placement[] {
  const now = input.now ?? new Date();
  const totalDays = Math.max(1, Math.min(14, input.days || 7));
  const calendar = campaignDays(totalDays, now);
  const ordered = [...input.posts].sort((a, b) => a.slot.localeCompare(b.slot));
  const taken = new Set<string>();
  const perPlatform = new Map<Platform, number>();

  return ordered.map((post, index) => {
    const dayIndex = Math.min(totalDays - 1, Math.floor((index * totalDays) / Math.max(1, ordered.length)));
    const count = (perPlatform.get(post.platform) ?? 0) + 1;
    perPlatform.set(post.platform, count);

    let slot = "";
    const windows = WINDOWS[post.platform];
    // Walk forward from the planned day until a window is free; worst case it lands later.
    for (let d = dayIndex; !slot && d < dayIndex + 14; d++) {
      const date = d < calendar.length ? calendar[d] : addDays(calendar[0].y, calendar[0].m, calendar[0].d, d);
      for (const [hh, mm] of windows) {
        const iso = zonedISO(date.y, date.m, date.d, hh, mm);
        const key = `${post.platform}|${iso}`;
        if (!taken.has(key) && Date.parse(iso) > now.getTime() + 10 * 60_000) {
          taken.add(key);
          slot = iso;
          break;
        }
      }
    }
    slot ||= post.slot;

    const content = `${post.platform}-d${dayIndex + 1}-${count}`;
    const link = utmLink(input.landing, { source: UTM_SOURCE[post.platform], medium: "social", campaign: input.campaign, content });
    let caption = post.caption;
    let linkPlacement: Placement["linkPlacement"] = BIO_LINK.has(post.platform) ? "bio" : "manual";
    if (!BIO_LINK.has(post.platform)) {
      const tagged = tagLinks(post.caption, input.landing, link);
      if (tagged && tagged.length <= input.limits[post.platform]) {
        caption = tagged;
        linkPlacement = "caption";
      }
    }
    return { postId: post.id, platform: post.platform, day: dayIndex + 1, slot, content, link, linkPlacement, caption };
  });
}
