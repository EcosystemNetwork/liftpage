/*
 * Revenue attribution, pure part: what a tracking call may contain, and how events and leads
 * add up into a funnel per campaign and per post. No database here, so it's testable and
 * safe to import anywhere.
 *
 * Model: last LiftPage touch. A landing tagged utm_campaign=lp-… is remembered in the
 * visitor's browser (lib/lp.js) and attached to the lead or sale that follows. Revenue is
 * whatever the site reports, plus deals an operator marks won; it is labelled as such.
 */

export const TRACK_KINDS = ["visit", "lead", "conversion"] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Touch = { campaign: string; source: string; medium: string; content: string };
export const NO_TOUCH: Touch = { campaign: "", source: "", medium: "", content: "" };

export type TrackEvent = {
  key: string;
  kind: TrackKind;
  touch: Touch;
  path: string;
  email?: string;
  name?: string;
  company?: string;
  valueCents?: number;
  currency?: string;
  externalId?: string;
};

export type AttributionEvent = { kind: TrackKind; campaign: string; content: string; valueCents?: number; currency?: string; leadId?: string; at: string };

export type Lead = {
  id: string;
  brandId: string;
  email: string;
  name: string;
  company: string;
  touch: Touch;
  status: LeadStatus;
  valueCents?: number;
  currency: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/** LiftPage's own campaign tags; anything else in utm_campaign isn't ours to count. */
export const isOurCampaign = (tag: string) => /^lp-\d{8}-[0-9a-f]{6}$/.test(tag);

const MAX_CENTS = 100_000_000_000;

function token(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
}

/** Lower-case, trimmed, and shaped like an address; otherwise undefined. */
export function cleanEmail(value: unknown): string | undefined {
  const email = token(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function cleanTouch(value: unknown): Touch {
  if (!value || typeof value !== "object") return NO_TOUCH;
  const raw = value as Record<string, unknown>;
  const campaign = token(raw.campaign, 80);
  if (!isOurCampaign(campaign)) return NO_TOUCH;
  return { campaign, source: token(raw.source, 80).toLowerCase(), medium: token(raw.medium, 80).toLowerCase(), content: token(raw.content, 80) };
}

/**
 * Validates a tracking call from a client's site. The body is untrusted: unknown fields are
 * dropped, strings are capped, and a visit without one of our campaign tags is refused
 * (it would only be noise).
 */
export function parseTrack(body: unknown): TrackEvent | { error: string } {
  if (!body || typeof body !== "object") return { error: "Send JSON." };
  const raw = body as Record<string, unknown>;
  const key = token(raw.key, 64);
  if (!/^lpk_[A-Za-z0-9]{20,40}$/.test(key)) return { error: "Unknown key." };
  const kind = raw.kind as TrackKind;
  if (!TRACK_KINDS.includes(kind)) return { error: "Unknown kind." };
  const touch = cleanTouch(raw.touch);
  const path = token(raw.path, 300);
  if (kind === "visit") {
    if (!touch.campaign) return { error: "Not a LiftPage landing." };
    return { key, kind, touch, path };
  }
  const email = cleanEmail(raw.email);
  const externalId = token(raw.id, 120) || undefined;
  if (kind === "lead") {
    if (!email) return { error: "A lead needs an email." };
    return { key, kind, touch, path, email, name: token(raw.name, 200), company: token(raw.company, 200), externalId };
  }
  const value = typeof raw.value === "number" ? raw.value : Number(raw.value);
  if (!Number.isFinite(value) || value < 0) return { error: "A conversion needs a value (0 or more, in major units: 49.99)." };
  const valueCents = Math.round(value * 100);
  if (valueCents > MAX_CENTS) return { error: "That value is too large." };
  const currency = token(raw.currency, 10).toLowerCase() || "usd";
  if (!/^[a-z]{3}$/.test(currency)) return { error: "Currency is a three-letter code." };
  return { key, kind, touch, path, email, valueCents, currency, externalId };
}

/* ---------- The funnel ---------- */

export type Money = Record<string, number>;

export type Funnel = {
  visits: number;
  leads: number;
  conversions: number;
  /** Reported by the site, per currency, in minor units. */
  sales: Money;
  /** Deals marked won in the CRM, per currency, in minor units. */
  won: Money;
  wonDeals: number;
};

export const EMPTY_FUNNEL: Funnel = { visits: 0, leads: 0, conversions: 0, sales: {}, won: {}, wonDeals: 0 };

const addMoney = (money: Money, currency: string, cents: number) => ({ ...money, [currency]: (money[currency] ?? 0) + cents });

/** Adds events and leads into one funnel. Leads count once each, from the CRM, not from events. */
export function funnelOf(events: Pick<AttributionEvent, "kind" | "valueCents" | "currency">[], leads: Pick<Lead, "status" | "valueCents" | "currency">[]): Funnel {
  let funnel: Funnel = { ...EMPTY_FUNNEL, sales: {}, won: {} };
  for (const event of events) {
    if (event.kind === "visit") funnel.visits++;
    if (event.kind === "conversion") {
      funnel.conversions++;
      if (event.valueCents) funnel.sales = addMoney(funnel.sales, event.currency ?? "usd", event.valueCents);
    }
  }
  funnel.leads = leads.length;
  for (const lead of leads) {
    if (lead.status !== "won") continue;
    funnel = { ...funnel, wonDeals: funnel.wonDeals + 1, won: lead.valueCents ? addMoney(funnel.won, lead.currency, lead.valueCents) : funnel.won };
  }
  return funnel;
}

/** visits → leads → conversions, as 0–1, or null when there's nothing to divide by. */
export function rates(funnel: Funnel): { visitToLead: number | null; leadToSale: number | null } {
  return {
    visitToLead: funnel.visits ? funnel.leads / funnel.visits : null,
    leadToSale: funnel.leads ? (funnel.conversions + funnel.wonDeals) / funnel.leads : null,
  };
}

/** Sales plus won deals, per currency. */
export function revenue(funnel: Funnel): Money {
  const total: Money = { ...funnel.sales };
  for (const [currency, cents] of Object.entries(funnel.won)) total[currency] = (total[currency] ?? 0) + cents;
  return total;
}

export function formatMoney(money: Money): string {
  const parts = Object.entries(money)
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, cents]) => {
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
      } catch {
        return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
      }
    });
  return parts.length ? parts.join(" + ") : "—";
}

/** Splits a campaign's events and leads by utm_content (one bucket per post). */
export function byContent(
  events: Pick<AttributionEvent, "kind" | "valueCents" | "currency" | "content">[],
  leads: (Pick<Lead, "status" | "valueCents" | "currency"> & { touch: Pick<Touch, "content"> })[],
): Map<string, Funnel> {
  const keys = new Set([...events.map((e) => e.content), ...leads.map((l) => l.touch.content)]);
  const out = new Map<string, Funnel>();
  for (const key of keys) {
    out.set(
      key,
      funnelOf(
        events.filter((e) => e.content === key),
        leads.filter((l) => l.touch.content === key),
      ),
    );
  }
  return out;
}
