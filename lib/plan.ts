import { boardCounts, type Flag } from "./health";
import { PLATFORM_NAME, type ChangeRequest, type Connection, type Plan, type Post, type Project, type SiteCheck } from "./types";

/*
 * Pure rules for the client suite. No database, no network, so tests build inputs by hand.
 */

const DAY = 86_400_000;

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const date = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const OFFER_LABEL = { trial: "First month free", locked: "Locked price", standard: "Monthly" } as const;
export const PLAN_STATUS_LABEL = { pending: "Not started", trialing: "Free month", active: "Active", past_due: "Payment due", canceled: "Canceled" } as const;
export const PROJECT_STATUS_LABEL = { building: "Building", review: "In review", live: "Live", paused: "Paused" } as const;
export const CHANGE_STATUS_LABEL = { open: "Received", doing: "In progress", done: "Done" } as const;

/** The price, and one plain line about what the client pays and when. */
export function planTerms(plan: Plan, now = Date.now()): { price: string; terms: string } {
  const price = `${money(plan.monthly)}/mo`;
  if (plan.status === "canceled") return { price, terms: "Canceled. Message us to pick it back up." };
  if (plan.offer === "trial" && plan.trialEndsAt) {
    const ends = Date.parse(plan.trialEndsAt);
    if (ends > now) {
      const left = Math.ceil((ends - now) / DAY);
      return { price, terms: `Free until ${date(plan.trialEndsAt)} (${left} day${left === 1 ? "" : "s"} left). Then ${price}.` };
    }
    return { price, terms: `Free month ended ${date(plan.trialEndsAt)}. ${price} from then.` };
  }
  if (plan.offer === "locked" && plan.lockedUntil) {
    return lockEnd(plan.lockedUntil) > now
      ? { price, terms: `Locked at ${price} through ${date(plan.lockedUntil)}. Rate card changes don't touch you.` }
      : { price, terms: `Price lock ended ${date(plan.lockedUntil)}.` };
  }
  return { price, terms: "Billed monthly. Cancel any time." };
}

const lockEnd = (day: string) => Date.parse(`${day}T23:59:59Z`);

/** What /api/stripe/subscribe sends back in ?plan=. Codes only, so a link can't put words on the page. */
export const PLAN_NOTICES = {
  started: "You're set. Stripe emails a receipt each month.",
  "not-client": "Only the client can start their own plan.",
  "no-payments": "Card payments aren't switched on yet. LiftPage will invoice you.",
  "too-many": "Too many tries. Wait a while.",
  "no-plan": "There's no plan waiting for a card.",
  "stripe-failed": "Stripe didn't open a checkout page. Try again.",
} as const;
export type PlanNotice = keyof typeof PLAN_NOTICES;

export function planNotice(value: unknown): PlanNotice | undefined {
  return typeof value === "string" && value in PLAN_NOTICES ? (value as PlanNotice) : undefined;
}

/** True when the client should see a button to put a card on file. */
export function canSubscribe(plan: Plan | null): boolean {
  return Boolean(plan && !plan.subscribed && plan.monthly > 0 && (plan.status === "pending" || plan.status === "trialing"));
}

/**
 * Stripe wants trial_end at least 48 hours out. Returns the unix second to send, or
 * undefined when the free month is (nearly) over and billing should just start.
 */
export function stripeTrialEnd(plan: Plan, now = Date.now()): number | undefined {
  if (plan.offer !== "trial" || !plan.trialEndsAt) return undefined;
  const ends = Date.parse(plan.trialEndsAt);
  return ends - now >= 2 * DAY + 60 * 60_000 ? Math.floor(ends / 1000) : undefined;
}

/** Stripe subscription status → ours. */
export function fromStripeStatus(status: string): Plan["status"] {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "pending";
  }
}

/** Only http(s), no credentials, a real-looking host. Returns the cleaned URL or null. */
export function cleanUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** How a check reads to a person. */
export function checkLine(check: SiteCheck | undefined, now = Date.now()): string {
  if (!check) return "Not checked yet";
  const ago = Math.max(0, Math.round((now - Date.parse(check.at)) / 60_000));
  const when = ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago / 60)}h ago` : `${Math.round(ago / 1440)}d ago`;
  if (check.ok) return `Up · ${check.ms ?? "?"} ms · checked ${when}`;
  return `Down${check.code ? ` (${check.code})` : check.error ? ` (${check.error})` : ""} · checked ${when}`;
}

/** The social card's numbers, from the client's board. */
export function socialSummary(posts: Pick<Post, "status" | "publishState" | "slot" | "notes">[], connections: Pick<Connection, "platform" | "accountName">[]) {
  const count = boardCounts(posts);
  return {
    drafts: count.drafts,
    scheduled: count.cued,
    published: count.published,
    networks: connections.map((c) => `${PLATFORM_NAME[c.platform]}${c.accountName ? ` ${c.accountName}` : ""}`),
  };
}

export type SuiteSnapshot = {
  projects: Pick<Project, "kind" | "status" | "name" | "check">[];
  changes: Pick<ChangeRequest, "status">[];
  plan: Plan | null;
};

/** What about projects and the plan wants an admin's attention. Same shape as health flags. */
export function suiteFlags(s: SuiteSnapshot, now = Date.now()): Flag[] {
  const flags: Flag[] = [];
  for (const p of s.projects) {
    if (p.kind === "website" && p.status === "live" && p.check && !p.check.ok) flags.push({ key: `down-${p.name}`, tone: "heat", text: `${p.name} is down` });
  }
  const plan = s.plan;
  if (plan?.status === "past_due") flags.push({ key: "past-due", tone: "heat", text: "Plan payment is past due" });
  const open = s.changes.filter((c) => c.status === "open").length;
  if (open) flags.push({ key: "changes", tone: "tape", text: `${open} change request${open === 1 ? "" : "s"} waiting` });
  if (plan && plan.offer === "trial" && plan.trialEndsAt && plan.status !== "canceled") {
    const left = Date.parse(plan.trialEndsAt) - now;
    if (left > 0 && left < 7 * DAY) flags.push({ key: "trial-ending", tone: "tape", text: `Free month ends in ${Math.ceil(left / DAY)}d${plan.subscribed ? "" : ", no card on file"}` });
  }
  if (plan && plan.offer === "locked" && plan.lockedUntil && plan.status !== "canceled") {
    const left = lockEnd(plan.lockedUntil) - now;
    if (left > 0 && left < 30 * DAY) flags.push({ key: "lock-ending", tone: "mute", text: `Price lock ends in ${Math.ceil(left / DAY)}d` });
  }
  if (!plan && s.projects.length) flags.push({ key: "no-plan", tone: "mute", text: "No monthly plan yet" });
  return flags;
}
