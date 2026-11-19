import { change } from "./stats";
import { PLATFORMS, type Connection, type Metric, type Platform, type Post } from "./types";

const DAY = 86_400_000;
/** Weeks in the overview's window. Totals compare this many weeks with the same span before. */
export const WINDOW = 4;
/** Weeks drawn in the impressions sparkline. */
const SPARK = 12;

export type AccountState = "connected" | "reconnect" | "missing";

export type AccountRow = {
  platform: Platform;
  /** The handle or page name, when the network told us. */
  name: string;
  state: AccountState;
  connectedAt?: string;
  /** Followers in the latest logged week on this network. */
  followers: number | null;
  /** Impressions over the window on this network. */
  impressions: number | null;
};

export type Overview = {
  /** Mondays bounding the window, YYYY-MM-DD, or null with no numbers yet. */
  from: string | null;
  to: string | null;
  impressions: { total: number; change: number | null; spark: number[] };
  followers: { total: number; change: number | null };
  engagements: number;
  /** engagements ÷ impressions across the window, 0–1. */
  rate: number | null;
  clicks: { total: number; change: number | null };
  leads: { total: number; change: number | null };
  posts: { published30: number; scheduled: number; next: Pick<Post, "platform" | "slot" | "hook"> | null; last: Pick<Post, "platform" | "publishedAt" | "publishedUrl" | "hook"> | null };
  accounts: AccountRow[];
  /** When numbers last came in from a network on their own. */
  lastSync: string | null;
  /** The moment this was worked out, so the page can say "2h ago" without reading the clock in render. */
  now: number;
};

type Input = {
  metrics: Metric[];
  posts: Pick<Post, "platform" | "slot" | "hook" | "status" | "publishState" | "publishedAt" | "publishedUrl">[];
  connections: Connection[];
  /** The networks the board is meant to run on. */
  platforms: Platform[];
  now?: number;
};

function shift(week: string, weeks: number): string {
  return new Date(Date.parse(`${week}T00:00:00Z`) + weeks * 7 * DAY).toISOString().slice(0, 10);
}

/**
 * The client dashboard's headline numbers. The window ends at the latest logged week,
 * not today, so a sync that lags a few days doesn't read as a collapse.
 */
export function overview({ metrics, posts, connections, platforms, now = Date.now() }: Input): Overview {
  const latest = metrics.reduce<string | null>((max, m) => (max === null || m.week > max ? m.week : max), null);
  const from = latest ? shift(latest, -(WINDOW - 1)) : null;
  const priorFrom = latest ? shift(latest, -(2 * WINDOW - 1)) : null;
  const inWindow = (m: Metric) => from !== null && m.week >= from && m.week <= latest!;
  const inPrior = (m: Metric) => priorFrom !== null && m.week >= priorFrom && m.week < from!;
  const sum = (rows: Metric[], field: "impressions" | "engagements" | "clicks" | "leads") => rows.reduce((n, m) => n + m[field], 0);

  const now4 = metrics.filter(inWindow);
  const prior4 = metrics.filter(inPrior);
  const hasPrior = prior4.length > 0;
  const pair = (field: "impressions" | "clicks" | "leads") => {
    const total = sum(now4, field);
    return { total, change: hasPrior ? change(total, sum(prior4, field)) : null };
  };

  // Followers are a stock, not a flow: latest week per network, against the week WINDOW back.
  const followersAt = (week: string | null) => (week ? metrics.filter((m) => m.week === week).reduce((n, m) => n + m.followers, 0) : 0);
  const priorWeek = latest ? shift(latest, -WINDOW) : null;
  const followers = followersAt(latest);
  const followersBefore = priorWeek && metrics.some((m) => m.week === priorWeek) ? followersAt(priorWeek) : undefined;

  const spark: number[] = [];
  if (latest) {
    for (let i = SPARK - 1; i >= 0; i--) {
      const week = shift(latest, -i);
      spark.push(metrics.filter((m) => m.week === week).reduce((n, m) => n + m.impressions, 0));
    }
    while (spark.length > 1 && spark[0] === 0) spark.shift();
  }

  const impressions = pair("impressions");
  const engagements = sum(now4, "engagements");

  const live = posts.filter((p) => p.publishState === "published");
  const published30 = live.filter((p) => p.publishedAt && now - Date.parse(p.publishedAt) <= 30 * DAY).length;
  const upcoming = posts
    .filter((p) => p.status === "cued" && p.publishState !== "published" && p.publishState !== "publishing" && p.publishState !== "failed")
    .sort((a, b) => a.slot.localeCompare(b.slot));
  const next = upcoming.find((p) => Date.parse(p.slot) >= now) ?? null;
  const last =
    [...live].filter((p) => p.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))[0] ?? null;

  // Every network the board runs on or is connected to, in the usual order.
  const wanted = new Set<Platform>([...platforms, ...connections.map((c) => c.platform)]);
  const accounts = PLATFORMS.filter((p) => wanted.has(p)).map((platform): AccountRow => {
    const c = connections.find((x) => x.platform === platform);
    const latestRow = latest ? metrics.find((m) => m.week === latest && m.platform === platform) : undefined;
    const windowRows = now4.filter((m) => m.platform === platform);
    return {
      platform,
      name: c?.accountName ?? "",
      // Tokens are refreshed days ahead; one past its expiry means the refresh failed.
      state: !c ? "missing" : c.expiresAt && Date.parse(c.expiresAt) < now ? "reconnect" : "connected",
      connectedAt: c?.connectedAt,
      followers: latestRow ? latestRow.followers : null,
      impressions: windowRows.length ? windowRows.reduce((n, m) => n + m.impressions, 0) : null,
    };
  });

  const lastSync = metrics.filter((m) => m.source === "sync").reduce<string | null>((max, m) => (max === null || m.at > max ? m.at : max), null);

  return {
    from,
    to: latest,
    impressions: { ...impressions, spark },
    followers: { total: followers, change: change(followers, followersBefore) },
    engagements,
    rate: impressions.total > 0 ? engagements / impressions.total : null,
    clicks: pair("clicks"),
    leads: pair("leads"),
    posts: {
      published30,
      scheduled: upcoming.length,
      next: next ? { platform: next.platform, slot: next.slot, hook: next.hook } : null,
      last: last ? { platform: last.platform, publishedAt: last.publishedAt, publishedUrl: last.publishedUrl, hook: last.hook } : null,
    },
    accounts,
    lastSync,
    now,
  };
}
