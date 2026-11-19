import "server-only";
import { upsertMetrics, type MetricInput } from "../metrics";
import { weekOf } from "../stats";
import { db, must } from "../supabase/server";
import type { MetricField, Platform } from "../types";
import { accountFor, call, LINKEDIN_VERSION, type Account } from "./oauth";

type Numbers = Partial<Record<MetricField, number>>;
type Window = { week: string; start: Date; end: Date; current: boolean };

const DAY = 86_400_000;
const sum = (list: (number | undefined)[]) => list.reduce<number>((total, n) => total + (Number(n) || 0), 0);

/** This Monday-week so far, and the whole week before it. Followers only on the current one. */
function windows(now = new Date()): Window[] {
  const week = weekOf(now)!;
  const start = new Date(`${week}T00:00:00Z`);
  const prev = new Date(start.getTime() - 7 * DAY);
  return [
    { week: weekOf(prev)!, start: prev, end: start, current: false },
    { week, start, end: now, current: true },
  ];
}

async function x(account: Account, w: Window): Promise<Numbers> {
  const auth = { Authorization: `Bearer ${account.token}` };
  const out: Numbers = {};
  if (w.current) {
    const me = await call<{ data: { public_metrics: { followers_count: number } } }>("x", "https://api.x.com/2/users/me?user.fields=public_metrics", { headers: auth });
    out.followers = me.body.data.public_metrics.followers_count;
  }
  const url = new URL(`https://api.x.com/2/users/${account.accountId}/tweets`);
  url.searchParams.set("start_time", w.start.toISOString());
  url.searchParams.set("end_time", new Date(Math.min(w.end.getTime(), Date.now() - 15_000)).toISOString());
  url.searchParams.set("max_results", "100");
  url.searchParams.set("tweet.fields", "public_metrics");
  const { body } = await call<{ data?: { public_metrics: Record<string, number> }[] }>("x", url.toString(), { headers: auth });
  const tweets = body.data ?? [];
  out.impressions = sum(tweets.map((t) => t.public_metrics.impression_count));
  out.engagements = sum(tweets.flatMap((t) => [t.public_metrics.like_count, t.public_metrics.retweet_count, t.public_metrics.reply_count, t.public_metrics.quote_count]));
  return out;
}

async function instagram(account: Account, w: Window): Promise<Numbers> {
  const out: Numbers = {};
  const token = `access_token=${encodeURIComponent(account.token)}`;
  if (w.current) {
    const me = await call<{ followers_count: number }>("instagram", `https://graph.instagram.com/${account.accountId}?fields=followers_count&${token}`);
    out.followers = me.body.followers_count;
  }
  const since = Math.floor(w.start.getTime() / 1000);
  const until = Math.floor(w.end.getTime() / 1000);
  // views and total_interactions replaced impressions and engagement; website_clicks is gone.
  const { body } = await call<{ data: { name: string; total_value?: { value: number } }[] }>(
    "instagram",
    `https://graph.instagram.com/${account.accountId}/insights?metric=views,total_interactions&period=day&metric_type=total_value&since=${since}&until=${until}&${token}`,
  );
  for (const metric of body.data) {
    if (metric.name === "views") out.impressions = metric.total_value?.value ?? 0;
    if (metric.name === "total_interactions") out.engagements = metric.total_value?.value ?? 0;
  }
  return out;
}

async function linkedin(account: Account, w: Window): Promise<Numbers | null> {
  // Page statistics only exist for organizations; a member connection has none.
  if (!account.accountId.startsWith("urn:li:organization:")) return null;
  const headers = { Authorization: `Bearer ${account.token}`, "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" };
  const org = encodeURIComponent(account.accountId);
  const out: Numbers = {};
  if (w.current) {
    const size = await call<{ firstDegreeSize: number }>(
      "linkedin",
      `https://api.linkedin.com/rest/networkSizes/${org}?edgeType=COMPANY_FOLLOWED_BY_COMPANY`,
      { headers },
    );
    out.followers = size.body.firstDegreeSize;
  }
  const range = `(timeRange:(start:${w.start.getTime()},end:${w.end.getTime()}),timeGranularityType:DAY)`;
  const { body } = await call<{ elements: { totalShareStatistics: Record<string, number> }[] }>(
    "linkedin",
    `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&timeIntervals=${range}`,
    { headers },
  );
  const days = body.elements.map((e) => e.totalShareStatistics);
  out.impressions = sum(days.map((d) => d.impressionCount));
  out.clicks = sum(days.map((d) => d.clickCount));
  out.engagements = sum(days.flatMap((d) => [d.likeCount, d.commentCount, d.shareCount]));
  return out;
}

async function youtube(account: Account, w: Window): Promise<Numbers> {
  const auth = { Authorization: `Bearer ${account.token}` };
  const out: Numbers = {};
  if (w.current) {
    const ch = await call<{ items?: { statistics: { subscriberCount: string } }[] }>(
      "youtube",
      "https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true",
      { headers: auth },
    );
    out.followers = Number(ch.body.items?.[0]?.statistics.subscriberCount ?? 0);
  }
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const endDay = new Date(Math.max(w.start.getTime(), w.end.getTime() - DAY));
  const { body } = await call<{ columnHeaders: { name: string }[]; rows?: number[][] }>(
    "youtube",
    `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${day(w.start)}&endDate=${day(endDay)}&metrics=views,likes,comments,shares`,
    { headers: auth },
  );
  const row = body.rows?.[0] ?? [];
  const col = (name: string) => row[body.columnHeaders.findIndex((h) => h.name === name)] ?? 0;
  out.impressions = col("views");
  out.engagements = col("likes") + col("comments") + col("shares");
  return out;
}

async function tiktok(account: Account, w: Window): Promise<Numbers> {
  const auth = { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" };
  const out: Numbers = {};
  if (w.current) {
    const me = await call<{ data: { user: { follower_count: number } } }>(
      "tiktok",
      "https://open.tiktokapis.com/v2/user/info/?fields=follower_count",
      { headers: auth },
    );
    out.followers = me.body.data.user.follower_count;
  }
  // TikTok has no account-level weekly report. Sum lifetime counts of the videos posted in
  // the week: close for recent weeks, an undercount of older videos' late views.
  type Video = { create_time: number; view_count?: number; like_count?: number; comment_count?: number; share_count?: number };
  const videos: Video[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 5; page++) {
    const { body } = await call<{ data: { videos: Video[]; cursor: number; has_more: boolean } }>(
      "tiktok",
      "https://open.tiktokapis.com/v2/video/list/?fields=create_time,view_count,like_count,comment_count,share_count",
      { method: "POST", headers: auth, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) },
    );
    videos.push(...body.data.videos);
    const oldest = body.data.videos.at(-1)?.create_time ?? 0;
    if (!body.data.has_more || oldest * 1000 < w.start.getTime()) break;
    cursor = body.data.cursor;
  }
  const inWeek = videos.filter((v) => v.create_time * 1000 >= w.start.getTime() && v.create_time * 1000 < w.end.getTime());
  out.impressions = sum(inWeek.map((v) => v.view_count));
  out.engagements = sum(inWeek.flatMap((v) => [v.like_count, v.comment_count, v.share_count]));
  return out;
}

const READERS: Record<Platform, (account: Account, w: Window) => Promise<Numbers | null>> = { x, instagram, linkedin, youtube, tiktok };

export type SyncReport = { platform: Platform; ok: boolean; note: string }[];

/**
 * Pulls this week and last week from every network connected to the client's board into
 * their metrics. Merges: leads and anything a network doesn't report keep typed values.
 */
export async function syncInsights(userId: string): Promise<SyncReport> {
  const brand = must(await db().from("brands").select("id").eq("client_id", userId).maybeSingle(), "find board") as { id: string } | null;
  if (!brand) return [];
  const rows = must(await db().from("social_accounts").select("platform").eq("brand_id", brand.id), "find connections") as { platform: Platform }[];
  const report: SyncReport = [];
  for (const { platform } of rows) {
    try {
      const account = await accountFor(brand.id, platform);
      const inputs: MetricInput[] = [];
      for (const w of windows()) {
        const numbers = await READERS[platform](account, w);
        if (numbers === null) break;
        inputs.push({ userId, week: w.week, platform, ...numbers });
      }
      if (!inputs.length) {
        report.push({ platform, ok: false, note: "No insights for this kind of account." });
        continue;
      }
      await upsertMetrics(inputs, `sync:${platform}`, "sync");
      report.push({ platform, ok: true, note: `Synced ${inputs.map((i) => i.week).join(", ")}.` });
    } catch (error) {
      report.push({ platform, ok: false, note: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    }
  }
  return report;
}

/** Every client with a board and at least one connection. */
export async function syncableClients(): Promise<string[]> {
  const rows = must(
    await db().from("brands").select("client_id, social_accounts!inner(platform)").not("client_id", "is", null),
    "list syncable",
  ) as { client_id: string }[];
  return [...new Set(rows.map((r) => r.client_id))];
}
