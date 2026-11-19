import { WEEKDAYS, ptWeekday, type AutopilotSettings } from "./autopilot-plan";
import { addDays, ptYMD, zonedISO } from "./time";
import { PLATFORM_NAME, type AdminEvent, type Campaign, type Connection, type Post, type Project } from "./types";

/*
 * What LiftPage does for a client, said to the client. Admins run autopilot, growth
 * campaigns, syncs, reports and site checks from their side; this turns that machinery
 * into a list of services the client can see working, and a log of what was done.
 * Pure, so tests can build the inputs by hand. The page does the reading.
 */

export type ServiceId = "posting" | "autopilot" | "growth" | "reports" | "numbers" | "uptime" | "tools";

export type ServiceState = "on" | "off" | "attention";

export type Service = {
  id: ServiceId;
  name: string;
  /** One line on what it does, in the client's terms. */
  what: string;
  state: ServiceState;
  /** What it did last, already worded. */
  last?: string;
  /** When it runs next, already worded. */
  next?: string;
  /** For a service that's off: the change request that asks for it. */
  ask?: string;
};

export type ServiceInput = {
  now: Date;
  posts: Pick<Post, "status" | "publishState" | "slot" | "platform" | "publishedAt" | "notes">[];
  connections: Pick<Connection, "platform" | "expiresAt">[];
  autopilot: Pick<AutopilotSettings, "enabled" | "weekday" | "lastRunAt"> | null;
  campaign: Pick<Campaign, "status" | "createdAt" | "finishedAt" | "postIds"> | null;
  projects: Pick<Project, "kind" | "status" | "check">[];
  /** Newest sync of their numbers. */
  lastSync: string | null;
  reportsOn: boolean;
  /** Last weekly report emailed to this client, from the log. */
  lastReport?: string;
  tools: number;
  /** Drafts waiting on the client; autopilot holds off past its limit. */
  pending: number;
  pendingLimit: number;
};

const ZONE = "America/Los_Angeles";

/** "Mon, Nov 23, 8:00 AM" in Pacific. */
export function when(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** The next time a Pacific-time schedule fires after `now`: every day, or one weekday (0 = Sunday). */
export function nextRun(now: Date, at: { hour: number; minute?: number; weekday?: number }): string {
  const today = ptYMD(now);
  for (let n = 0; n <= 8; n += 1) {
    const day = addDays(today.y, today.m, today.d, n);
    const iso = zonedISO(day.y, day.m, day.d, at.hour, at.minute ?? 0);
    if (Date.parse(iso) <= now.getTime()) continue;
    if (at.weekday !== undefined && ptWeekday(new Date(iso)) !== at.weekday) continue;
    return iso;
  }
  // Unreachable for a valid weekday; keeps the type honest.
  return now.toISOString();
}

/** The next hourly site check (the job runs at :07). */
function nextHourly(now: Date): string {
  const next = new Date(now);
  next.setUTCMinutes(7, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 1);
  return next.toISOString();
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildServices(s: ServiceInput): Service[] {
  const now = s.now.getTime();
  const MONTH = 30 * 86_400_000;
  const published = s.posts
    .filter((p) => p.publishState === "published" && p.publishedAt)
    .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
  const lastMonth = published.filter((p) => now - Date.parse(p.publishedAt!) < MONTH).length;
  const upcoming = s.posts
    .filter((p) => p.status === "cued" && (p.publishState === "idle" || p.publishState === "scheduled") && Date.parse(p.slot) > now)
    .sort((a, b) => a.slot.localeCompare(b.slot));
  const failed = s.posts.filter((p) => p.publishState === "failed").length;
  const stale = s.connections.filter((c) => c.expiresAt && Date.parse(c.expiresAt) < now).length;
  const networks = [...new Set(s.connections.map((c) => PLATFORM_NAME[c.platform]))];

  const services: Service[] = [];

  // Posting: the thing they pay for, so it goes first.
  services.push(
    s.connections.length
      ? {
          id: "posting",
          name: "Posting for you",
          what: `We post your approved posts at the best times on ${networks.join(", ")}.`,
          state: failed || stale ? "attention" : "on",
          last: failed
            ? `${plural(failed, "post")} didn’t go out. We’re fixing it.`
            : stale
              ? `${plural(stale, "network")} needs reconnecting. We’re on it.`
              : published[0]
                ? `Last post ${when(published[0].publishedAt!)} on ${PLATFORM_NAME[published[0].platform]} · ${lastMonth} in the last 30 days`
                : "Nothing posted yet.",
          next: upcoming[0] ? `${when(upcoming[0].slot)} on ${PLATFORM_NAME[upcoming[0].platform]} · ${upcoming.length} scheduled` : "Nothing scheduled yet.",
        }
      : {
          id: "posting",
          name: "Posting for you",
          what: "We post for you on X, LinkedIn, Instagram, TikTok and YouTube, at the times your audience is on.",
          state: "off",
          ask: "Please start posting for us. Tell me what you need to connect our accounts.",
        },
  );

  const ap = s.autopilot;
  services.push(
    ap?.enabled
      ? {
          id: "autopilot",
          name: "Weekly drafts",
          what: `Every ${WEEKDAYS[ap.weekday]} our autopilot writes next week’s posts from what you approved, what you sent back, and what performed. You approve before anything goes out.`,
          state: s.pending >= s.pendingLimit ? "attention" : "on",
          last: ap.lastRunAt ? `Last wrote ${when(ap.lastRunAt)}` : "Hasn’t run yet.",
          next:
            s.pending >= s.pendingLimit
              ? `On hold until you look over the ${plural(s.pending, "draft")} waiting.`
              : when(nextRun(s.now, { hour: 15, weekday: ap.weekday })),
        }
      : {
          id: "autopilot",
          name: "Weekly drafts",
          what: "An AI that writes next week’s posts every week, learning from what you approve and what gets results. Nothing goes out without your yes.",
          state: "off",
          ask: "Please switch on weekly drafts (content autopilot) for us.",
        },
  );

  const c = s.campaign;
  services.push(
    c
      ? {
          id: "growth",
          name: "Growth research",
          what: "Our research agents read your site and your competitors, find the angles that win, and turn them into posts.",
          state: c.status === "failed" ? "attention" : "on",
          last:
            c.status === "queued" || c.status === "running"
              ? "Researching now. New drafts land on your board when it’s done."
              : c.status === "ready"
                ? `Finished ${when(c.finishedAt ?? c.createdAt)}${c.postIds.length ? ` · ${plural(c.postIds.length, "post")} drafted` : ""}`
                : "The last run hit a snag. We’re rerunning it.",
        }
      : {
          id: "growth",
          name: "Growth research",
          what: "Research agents read your site and your competitors, find the angles that win, and turn them into a campaign.",
          state: "off",
          ask: "Please run a growth research campaign for us: our market, our competitors, and posts from what you find.",
        },
  );

  services.push(
    s.reportsOn
      ? {
          id: "reports",
          name: "Weekly report",
          what: "Every Monday morning: last week’s numbers against the week before, and what’s coming up.",
          state: "on",
          last: s.lastReport ? `Last sent ${when(s.lastReport)}` : undefined,
          next: when(nextRun(s.now, { hour: 8, weekday: 1 })),
        }
      : {
          id: "reports",
          name: "Weekly report",
          what: "A short email every Monday with how last week went and what’s next.",
          state: "off",
          ask: "Please email us a weekly report.",
        },
  );

  services.push(
    s.connections.length
      ? {
          id: "numbers",
          name: "Numbers, kept current",
          what: "We pull your reach, followers, clicks and leads from every network each morning, so you never copy them by hand.",
          state: "on",
          last: s.lastSync ? `Last pulled ${when(s.lastSync)}` : "First pull comes after your first week of posts.",
          next: when(nextRun(s.now, { hour: 6 })),
        }
      : {
          id: "numbers",
          name: "Numbers, kept current",
          what: "Your reach, followers, clicks and leads, pulled from every network each morning.",
          state: "off",
          ask: "Please connect our networks so our numbers update by themselves.",
        },
  );

  const sites = s.projects.filter((p) => p.kind === "website" && p.status === "live");
  const down = sites.filter((p) => p.check && !p.check.ok).length;
  const checked = sites.map((p) => p.check?.at).filter((at): at is string => Boolean(at)).sort().at(-1);
  services.push(
    sites.length
      ? {
          id: "uptime",
          name: "Website watch",
          what: `We check ${sites.length === 1 ? "your site" : `your ${sites.length} sites`} every hour and fix it if it goes down, often before you notice.`,
          state: down ? "attention" : "on",
          last: down ? `${plural(down, "site")} down right now. We’ve been told and we’re on it.` : checked ? `Up at ${when(checked)}` : "First check within the hour.",
          next: when(nextHourly(s.now)),
        }
      : {
          id: "uptime",
          name: "Website",
          what: "We build your site, keep it fast, and watch it every hour so it’s never down for long.",
          state: "off",
          ask: "We’d like LiftPage to build or take over our website.",
        },
  );

  services.push(
    s.tools
      ? {
          id: "tools",
          name: "Your AI tools",
          what: "Write posts, newsletters and more yourself, in your own voice. Everything you make waits for review.",
          state: "on",
          last: `${plural(s.tools, "tool")} switched on for you.`,
        }
      : {
          id: "tools",
          name: "Your AI tools",
          what: "Draft posts, newsletters, press notes and more yourself, in your brand’s voice, any time.",
          state: "off",
          ask: "Please switch on the AI writing tools for our account.",
        },
  );

  // What's working first, then what needs a look, then what they could add.
  const ORDER: Record<ServiceState, number> = { attention: 0, on: 1, off: 2 };
  return services.sort((a, b) => ORDER[a.state] - ORDER[b.state]);
}

/* ---------- Work log ---------- */

export type WorkItem = { at: string; text: string };

const count = (detail: string) => Number(detail.match(/^(\d+)/)?.[1] ?? 0);

/**
 * Only these logged actions reach the client, each in its own words. The admin log's
 * detail is never shown as is: it can name models, other boards, or internal notes.
 */
const SAFE: Record<string, (e: AdminEvent) => string | null> = {
  "drafted week": (e) => (count(e.detail) ? `We wrote ${plural(count(e.detail), "new post")} for you to look over` : "We wrote new posts for you to look over"),
  "autopilot run": (e) => (count(e.detail) ? `Autopilot wrote ${plural(count(e.detail), "post")} for next week` : "Autopilot wrote next week’s posts"),
  "approved drafts": () => "We approved the posts you OK’d with us",
  "scheduled approved": () => "We scheduled your approved posts",
  "paused publishing": () => "We paused your posting",
  "retried failed": () => "We re-sent posts that didn’t go out",
  "report sent": () => "We emailed your weekly report",
  "review nudge": () => "We let you know posts were ready for you",
  "started campaign": () => "We started growth research on your market",
  "social setup": () => "We updated your social accounts",
  "photos added": () => "We added photos to your library",
  "plan saved": () => "We updated your plan",
  "change request": (e) => (e.detail === "doing" ? "We started on one of your requests" : e.detail === "done" ? "We finished one of your requests" : null),
};

/** The client-safe story of the last while: our actions and their posts going out, newest first. */
export function workLog(events: AdminEvent[], posts: Pick<Post, "platform" | "publishState" | "publishedAt">[], limit = 12): WorkItem[] {
  const items: WorkItem[] = [];
  for (const event of events) {
    const text = SAFE[event.action]?.(event);
    if (text) items.push({ at: event.at, text });
  }
  for (const post of posts) {
    if (post.publishState === "published" && post.publishedAt) items.push({ at: post.publishedAt, text: `Posted on ${PLATFORM_NAME[post.platform]}` });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
