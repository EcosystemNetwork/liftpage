import { byWeek, change, fmt, weekOf } from "./stats";
import { PLATFORM_NAME, type Metric, type Post, type User } from "./types";

const DAY = 86_400_000;

export type Report = { subject: string; lines: string[]; week: string | null; empty: boolean };

function line(label: string, now: number, before: number | undefined, show: (n: number) => string): string {
  const delta = change(now, before);
  return `${label}: ${show(now)}${delta === null ? "" : ` (${fmt.delta(delta)} vs the week before)`}`;
}

/**
 * The weekly performance email for one client. Reads the last complete Monday-week (this
 * week's numbers are still coming in), the week before it, and the board around now.
 * `empty` means there is nothing worth sending.
 */
export function buildReport(client: Pick<User, "name" | "company">, metrics: Metric[], posts: Pick<Post, "status" | "publishState" | "slot" | "publishedAt" | "notes" | "platform">[], now = new Date()): Report {
  const thisWeek = weekOf(now)!;
  const weeks = byWeek(metrics).filter((w) => w.week < thisWeek);
  const latest = weeks.at(-1);
  const previous = weeks.at(-2);
  const t = now.getTime();

  const published = posts.filter((p) => p.publishState === "published" && p.publishedAt && t - Date.parse(p.publishedAt) < 7 * DAY).length;
  const upcoming = posts.filter((p) => p.status === "cued" && p.publishState === "scheduled" && Date.parse(p.slot) > t && Date.parse(p.slot) - t < 7 * DAY).length;
  const drafts = posts.filter((p) => p.status === "draft" && p.notes.at(-1)?.kind !== "changes").length;

  const lines: string[] = [];
  const who = client.name ? `${client.name}, h` : "H";
  if (latest) {
    lines.push(`${who}ere is how ${client.company || "your brand"} did the week of ${fmt.week(latest.week)}.`);
    lines.push(
      [
        line("Impressions", latest.impressions, previous?.impressions, fmt.whole),
        line("Engagements", latest.engagements, previous?.engagements, fmt.whole),
        latest.impressions ? `Engagement rate: ${fmt.pct(latest.engagements / latest.impressions)}` : null,
        line("Followers", latest.followers, previous?.followers, fmt.whole),
        line("Clicks", latest.clicks, previous?.clicks, fmt.whole),
        line("Leads", latest.leads, previous?.leads, fmt.whole),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const best = metrics.filter((m) => m.week === latest.week).sort((a, b) => b.impressions - a.impressions)[0];
    if (best && best.impressions > 0) lines.push(`Strongest network: ${PLATFORM_NAME[best.platform]}, ${fmt.whole(best.impressions)} impressions.`);
  } else {
    lines.push(`${who}ere is where ${client.company || "your brand"}'s board stands this week.`);
  }

  const board = [`${published} post${published === 1 ? "" : "s"} went out in the last 7 days`, `${upcoming} ${upcoming === 1 ? "is" : "are"} scheduled for the next 7`];
  lines.push(`${board.join(", and ")}.`);
  if (drafts) lines.push(`${drafts} draft${drafts === 1 ? " is" : "s are"} waiting for your approval. Nothing goes out until you approve it.`);

  return {
    subject: latest ? `${client.company || "Your"} weekly numbers: ${fmt.week(latest.week)}` : `${client.company || "Your"} weekly board update`,
    lines,
    week: latest?.week ?? null,
    empty: !latest && !published && !upcoming && !drafts,
  };
}
