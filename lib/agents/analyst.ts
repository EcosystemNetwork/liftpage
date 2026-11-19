import "server-only";
import { toMetric } from "../accounts";
import { formatMoney, revenue, type Funnel } from "../attribution";
import { boardReport } from "../attribution-store";
import { complete, type AiVia } from "../ai";
import { summarize } from "../stats";
import { db, must } from "../supabase/server";
import type { Brand, Metric } from "../types";
import { NO_INVENTION, parseAnalysis, type Analysis, type Research, type Strategy } from "./parse";

/** The numbers the analyst works from, as plain lines. Exported for tests. */
export function baselineLines(metrics: Metric[]): string[] {
  const summary = summarize(metrics);
  if (!summary.latest) return [];
  return summary.weeks.slice(-8).map((week) => {
    const rate = week.impressions > 0 ? ` (${((week.engagements / week.impressions) * 100).toFixed(1)}% engaged)` : "";
    return `Week of ${week.week}: ${week.impressions} impressions, ${week.engagements} engagements${rate}, ${week.clicks} clicks, ${week.leads} leads, ${week.followers} followers`;
  });
}

/** Past campaigns' real funnels, newest first, as plain lines. Exported for tests. */
export function funnelLines(campaigns: { tag: string; createdAt?: string; funnel: Funnel }[]): string[] {
  return campaigns
    .filter((item) => item.funnel.visits || item.funnel.leads || item.funnel.conversions)
    .slice(0, 3)
    .map((item) => {
      const sales = item.funnel.conversions + item.funnel.wonDeals;
      return `Campaign ${item.tag}${item.createdAt ? ` (${item.createdAt.slice(0, 10)})` : ""}: ${item.funnel.visits} tracked visits, ${item.funnel.leads} leads, ${sales} sales, revenue ${formatMoney(revenue(item.funnel))}`;
    });
}

/** Never throws: attribution is extra context, and the tables may not exist yet. */
async function pastFunnels(brandId: string): Promise<string[]> {
  try {
    const report = await boardReport(brandId);
    return funnelLines(report.campaigns.map((item) => ({ tag: item.tag, createdAt: item.campaign?.createdAt, funnel: item.funnel })));
  } catch {
    return [];
  }
}

async function recentMetrics(clientId: string | undefined): Promise<Metric[]> {
  if (!clientId) return [];
  const since = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10);
  return (must(await db().from("metrics").select("*").eq("user_id", clientId).gte("week", since).order("week"), "load numbers") ?? []).map(toMetric);
}

/**
 * Reads the client's recent numbers and the campaign plan, then proposes experiments with a
 * metric and a bar to clear. With no numbers yet, it says so and sets up the measurement
 * instead of guessing at results.
 */
export async function runAnalyst(input: { research: Research; strategy: Strategy; brand: Brand; goal: string; campaignTag?: string }): Promise<{
  output: Analysis & { weeksRead: number };
  via: AiVia;
  note: string;
}> {
  const [metrics, funnels] = await Promise.all([recentMetrics(input.brand.clientId), pastFunnels(input.brand.id)]);
  const baseline = baselineLines(metrics);
  const ask = [
    `You are the growth analyst for LiftPage, reviewing a 7-day campaign for ${input.research.product}.`,
    input.goal ? `Campaign goal: ${input.goal}` : "Goal: qualified visits to the site.",
    `KPIs the strategy picked: ${input.strategy.kpis.join("; ") || "none given"}`,
    `Channels: ${input.strategy.channels.map((c) => `${c.platform} (${c.cadence})`).join(", ") || "unknown"}`,
    input.campaignTag ? `Every link is tagged utm_campaign=${input.campaignTag}, utm_content=<network>-d<day>-<n>.` : "",
    baseline.length ? `Recent weekly numbers, all networks:\n${baseline.join("\n")}` : "There are no numbers for this client yet.",
    funnels.length ? `What past LiftPage campaigns drove on the client's site (tracked links):\n${funnels.join("\n")}` : "",
    "Write a `readout` (two or three sentences on where things stand, from the numbers only), the `baseline` to beat (copy figures from the numbers; if there are none, list what to record before day 1), up to 3 `experiments` for this campaign, and the `tracking` setup needed to judge them (UTM reports, sign-up source field, and so on).",
    "Each experiment changes one thing (hook style, posting time, format, call to action, channel) and has a metric and a success bar relative to the baseline (\"+20% clicks vs. last week\"), never an invented absolute number.",
    NO_INVENTION,
    'Return JSON only: {"readout":"","baseline":[""],"experiments":[{"name":"","hypothesis":"","change":"","metric":"","successBar":"","days":7}],"tracking":[""]}',
  ]
    .filter(Boolean)
    .join("\n");
  const answer = await complete(ask, {
    system: "You are a careful growth analyst. You return JSON only.",
    temperature: 0.3,
    maxOutputTokens: 2000,
    accept: (text) => parseAnalysis(text) !== null,
  });
  if ("error" in answer) throw new Error(answer.error);
  const analysis = parseAnalysis(answer.text)!;
  // The figures the analyst saw are ours, not the model's: keep them as the real baseline.
  const real = [...baseline, ...funnels];
  const output = { ...analysis, baseline: real.length ? real : analysis.baseline, weeksRead: baseline.length };
  return { output, via: answer.via, note: [baseline.length ? `Read ${baseline.length} weeks of numbers.` : "No numbers yet: set up the measurement.", ...answer.notes].join(" ") };
}
