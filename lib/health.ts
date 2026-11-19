import type { Connection, Hold, Post, User } from "./types";
import { PLATFORM_NAME } from "./types";

const DAY = 86_400_000;

/** What the health check reads about one client. Pure data, so tests build it by hand. */
export type ClientSnapshot = {
  user: User;
  hasBoard: boolean;
  posts: Pick<Post, "status" | "publishState" | "slot" | "notes">[];
  connections: Pick<Connection, "platform" | "expiresAt">[];
  /** Monday of the newest week with numbers, YYYY-MM-DD. */
  latestWeek?: string;
  unread: number;
  holds: Pick<Hold, "status" | "paidAt">[];
};

/** heat: something is broken or the client is waiting on us. tape: needs a move soon. mute: worth knowing. */
export type Flag = { key: string; tone: "heat" | "tape" | "mute"; text: string };

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Everything about a client that wants an admin's attention, worst first. */
export function clientFlags(s: ClientSnapshot, now = Date.now()): Flag[] {
  const flags: Flag[] = [];
  const live = s.user.stage === "active" || s.user.stage === "onboarding";

  const failed = s.posts.filter((p) => p.publishState === "failed").length;
  if (failed) flags.push({ key: "failed", tone: "heat", text: `${n(failed, "post")} failed to publish` });

  const sentBack = s.posts.filter((p) => p.status === "draft" && p.notes.at(-1)?.kind === "changes").length;
  if (sentBack) flags.push({ key: "sent-back", tone: "heat", text: `${n(sentBack, "line")} sent back by the client` });

  for (const c of s.connections) {
    if (!c.expiresAt) continue;
    const left = Date.parse(c.expiresAt) - now;
    if (left <= 0) flags.push({ key: `expired-${c.platform}`, tone: "heat", text: `${PLATFORM_NAME[c.platform]} connection expired` });
    else if (left < 7 * DAY) flags.push({ key: `expiring-${c.platform}`, tone: "tape", text: `${PLATFORM_NAME[c.platform]} connection expires in ${Math.ceil(left / DAY)}d` });
  }

  if (s.unread) flags.push({ key: "unread", tone: "tape", text: `${n(s.unread, "unread message")}` });

  if (s.holds.some((h) => h.status === "won" && !h.paidAt)) flags.push({ key: "unpaid", tone: "tape", text: "Won, deposit not paid" });

  if (!live) return flags;

  if (!s.hasBoard) {
    flags.push({ key: "no-board", tone: "tape", text: "No board yet" });
    return flags;
  }

  const upcoming = s.posts.filter((p) => p.status === "cued" && p.publishState === "scheduled" && Date.parse(p.slot) > now && Date.parse(p.slot) - now < 7 * DAY).length;
  if (!upcoming) flags.push({ key: "nothing-scheduled", tone: "tape", text: "Nothing scheduled for the next 7 days" });

  const drafts = s.posts.filter((p) => p.status === "draft" && p.notes.at(-1)?.kind !== "changes").length;
  if (drafts) flags.push({ key: "drafts", tone: "mute", text: `${n(drafts, "draft")} awaiting client approval` });

  const approved = s.posts.filter((p) => p.status === "approved" && p.publishState === "idle" && Date.parse(p.slot) > now).length;
  if (approved) flags.push({ key: "approved", tone: "mute", text: `${n(approved, "approved line")} not scheduled yet` });

  if (!s.connections.length) flags.push({ key: "no-networks", tone: "mute", text: "No networks connected" });

  if (!s.latestWeek || now - Date.parse(`${s.latestWeek}T00:00:00Z`) > 14 * DAY) flags.push({ key: "stale-numbers", tone: "mute", text: "No numbers in 2 weeks" });

  if (!s.user.lastLoginAt || now - Date.parse(s.user.lastLoginAt) > 30 * DAY) flags.push({ key: "quiet", tone: "mute", text: "No sign-in for 30 days" });

  return flags;
}

/** How many lines sit in each state, as the client tools count them. Matches what each tool acts on. */
export function boardCounts(posts: ClientSnapshot["posts"], now = Date.now()) {
  return {
    drafts: posts.filter((p) => p.status === "draft" && p.notes.at(-1)?.kind !== "changes").length,
    sentBack: posts.filter((p) => p.status === "draft" && p.notes.at(-1)?.kind === "changes").length,
    approved: posts.filter((p) => p.status === "approved" && p.publishState === "idle" && Date.parse(p.slot) > now).length,
    cued: posts.filter((p) => p.status === "cued" && p.publishState !== "published" && p.publishState !== "publishing").length,
    failed: posts.filter((p) => p.publishState === "failed").length,
    published: posts.filter((p) => p.publishState === "published").length,
  };
}

const WEIGHT = { heat: 100, tape: 10, mute: 1 } as const;

/** Higher is worse. For sorting clients so the ones that need a move come first. */
export function urgency(flags: Flag[]): number {
  return flags.reduce((sum, f) => sum + WEIGHT[f.tone], 0);
}
