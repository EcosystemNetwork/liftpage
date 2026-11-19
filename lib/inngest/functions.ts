import "server-only";
import { reachableClients, sendReport, weeklyReportsOn } from "../admin";
import { notifyAddress, sendMail } from "../email";
import { notifyHold } from "../notify";
import { checkSite, recordCheck, watchedSites } from "../projects";
import { siteUrl } from "../site";
import { weekOf } from "../stats";
import { loadPost, updatePost } from "../store";
import { syncableClients, syncInsights } from "../social/insights";
import { refresh } from "../social/oauth";
import { publishPost } from "../social/publish";
import { db } from "../supabase/server";
import type { Platform } from "../types";
import { beginCampaign, contentStart, finishStage, newsletterStage, postsStage, researchStage, strategyStage } from "../agents/run";
import type { Cut, Letter } from "../agents/content";
import type { Research, Strategy } from "../agents/parse";
import { enabledAutopilots, runAutopilot } from "../autopilot";
import { isDue } from "../autopilot-plan";
import { inngest } from "./client";

/**
 * Sleeps until the post's slot, then publishes. No retries: a retry after a network
 * accepted the post but before we recorded it would post twice. Failures land on the
 * desk with the network's error, and the operator hits Publish now.
 */
export const publishAtSlot = inngest.createFunction(
  { id: "publish-at-slot", retries: 0, triggers: [{ event: "liftpage/post.cued" }] },
  async ({ event, step }) => {
    const { postId, cueId, slot } = event.data as { postId: string; cueId: string; slot: string };
    if (Date.parse(slot) > Date.now()) await step.sleepUntil("wait-for-slot", slot);
    const still = await step.run("check-cue", async () => {
      const found = await loadPost(postId);
      return Boolean(found && found.cueId === cueId && found.post.status === "cued");
    });
    if (!still) return { skipped: "re-cued or un-cued" };
    return step.run("publish", () => publishPost(postId, cueId));
  },
);

export const holdCreated = inngest.createFunction(
  { id: "hold-created", retries: 4, triggers: [{ event: "liftpage/hold.created" }] },
  async ({ event, step }) => {
    const { holdId } = event.data as { holdId: string };
    await step.run("email", () => notifyHold(holdId));
  },
);

/** Pulls network numbers into client metrics. Daily for everyone, or one client on demand. */
export const insightsSync = inngest.createFunction(
  {
    id: "insights-sync",
    retries: 2,
    concurrency: { limit: 2 },
    triggers: [{ cron: "TZ=America/Los_Angeles 0 6 * * *" }, { event: "liftpage/insights.sync" }],
  },
  async ({ event, step }) => {
    const one = (event.data as { userId?: string } | undefined)?.userId;
    const users = one ? [one] : await step.run("list-clients", () => syncableClients());
    for (const userId of users) await step.run(`sync-${userId}`, () => syncInsights(userId));
    return { synced: users.length };
  },
);

/** Keeps long-lived tokens alive and clears old limiter rows. */
export const housekeeping = inngest.createFunction(
  { id: "housekeeping", retries: 2, triggers: [{ cron: "TZ=America/Los_Angeles 30 3 * * *" }] },
  async ({ step }) => {
    const refreshed = await step.run("refresh-tokens", async () => {
      const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
      const { data } = await db().from("social_accounts").select("*").lt("expires_at", soon).not("expires_at", "is", null);
      let ok = 0;
      for (const row of data ?? []) {
        try {
          await refresh(row.brand_id as string, row.platform as Platform, row as Record<string, string | null>);
          ok++;
        } catch (error) {
          console.error("refresh", row.brand_id, row.platform, error);
        }
      }
      return ok;
    });
    await step.run("clear-limits", async () => {
      await db().from("rate_limits").delete().lt("reset_at", new Date(Date.now() - 86_400_000).toISOString());
    });
    // A job that died mid-publish leaves the post stuck. Free it after 30 minutes.
    await step.run("unstick-publishing", async () => {
      const stale = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data } = await db().from("posts").select("id").eq("publish_state", "publishing").lt("updated_at", stale);
      for (const row of data ?? []) {
        await updatePost(row.id as string, { publish_state: "failed", publish_error: "Publishing stopped partway. Check the network before publishing again." });
      }
    });
    return { refreshed };
  },
);

/**
 * Monday-morning performance report to every onboarding and active client. Off unless
 * LIFTPAGE_WEEKLY_REPORTS=true. Runs after the 6am sync, so last week's numbers are in.
 * One step per client, and Resend's idempotency key is the week, so a retry can't double-mail.
 */
export const weeklyReports = inngest.createFunction(
  { id: "weekly-reports", retries: 2, triggers: [{ cron: "TZ=America/Los_Angeles 0 8 * * 1" }] },
  async ({ step }) => {
    if (!weeklyReportsOn()) return { skipped: "LIFTPAGE_WEEKLY_REPORTS is off" };
    const week = weekOf(new Date())!;
    const ids = await step.run("list-clients", async () => (await reachableClients()).map((c) => c.id));
    const tally: Record<string, number> = {};
    for (const id of ids) {
      const outcome = await step.run(`report-${id}`, () => sendReport(id, week));
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    }
    return tally;
  },
);

/**
 * Loads every live client website once an hour. A site that goes down, or comes back,
 * emails LiftPage once per change, not once per hour.
 */
export const siteChecks = inngest.createFunction(
  { id: "site-checks", retries: 1, triggers: [{ cron: "TZ=America/Los_Angeles 7 * * * *" }] },
  async ({ step }) => {
    const sites = await step.run("list-sites", () => watchedSites());
    let down = 0;
    for (const site of sites) {
      const check = await step.run(`check-${site.id}`, async () => {
        const result = await checkSite(site.url);
        await recordCheck(site.id, result);
        return result;
      });
      if (!check.ok) down++;
      const flipped = site.wasOk !== null && site.wasOk !== check.ok;
      const to = notifyAddress();
      if (flipped && to) {
        await step.run(`notify-${site.id}`, () =>
          sendMail({
            to,
            subject: check.ok ? `Back up: ${site.name}` : `Down: ${site.name}`,
            lines: [`${site.url} ${check.ok ? `answers again (${check.code}, ${check.ms} ms).` : `isn't answering${check.code ? ` (${check.code})` : check.error ? ` (${check.error})` : ""}.`}`],
            action: { label: "Open the customer", url: `${siteUrl()}/admin/customers/${site.clientId}#projects` },
            idempotencyKey: `site/${site.id}/${check.at.slice(0, 13)}`,
          }),
        );
      }
    }
    return { checked: sites.length, down };
  },
);

/**
 * A Growth OS campaign, one step per model call so each fits the host's function time
 * limit (Netlify cuts a request off at about a minute). Stages write their own failures
 * and return null, so a failed agent ends the run cleanly instead of retrying. Retries
 * here only cover a step that was cut off mid-flight.
 */
export const campaignRun = inngest.createFunction(
  {
    id: "campaign-run",
    retries: 1,
    concurrency: { limit: 3 },
    idempotency: "event.data.campaignId",
    triggers: [{ event: "liftpage/campaign.requested" }],
  },
  async ({ event, step }) => {
    const { campaignId } = event.data as { campaignId: string };
    if (!(await step.run("begin", () => beginCampaign(campaignId)))) return { skipped: "not queued" };
    const research = (await step.run("research", () => researchStage(campaignId))) as Research | null;
    if (!research) return { stopped: "research" };
    const strategy = (await step.run("strategy", () => strategyStage(campaignId, research))) as Strategy | null;
    if (!strategy) return { stopped: "strategy" };
    await step.run("content-start", () => contentStart(campaignId));
    const [cut, letter] = (await Promise.all([
      step.run("content-posts", () => postsStage(campaignId, research, strategy)),
      step.run("content-newsletter", () => newsletterStage(campaignId, research, strategy)),
    ])) as [Cut | null, Letter];
    if (!cut) return { stopped: "content" };
    const postIds = await step.run("content-save", () => finishStage(campaignId, research, strategy, cut, letter));
    return { posts: postIds?.length ?? 0 };
  },
);

/**
 * Content autopilot. Every afternoon it finds clients whose autopilot day is today and
 * writes next week as drafts, one step per client. Drafts only: approval and publishing
 * stay with people. A run skipped for a reason (drafts piling up, no AI) says why on the
 * customer page.
 */
export const autopilotDaily = inngest.createFunction(
  { id: "content-autopilot", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "TZ=America/Los_Angeles 0 15 * * *" }] },
  async ({ step }) => {
    const due = await step.run("list-due", async () => {
      const now = new Date();
      return (await enabledAutopilots()).filter((s) => isDue(s, now)).map((s) => s.clientId);
    });
    const tally = { drafted: 0, skipped: 0 };
    for (const clientId of due) {
      const outcome = await step.run(`autopilot-${clientId}`, () => runAutopilot(clientId));
      if ("ok" in outcome) tally.drafted++;
      else tally.skipped++;
    }
    return tally;
  },
);

export const functions = [publishAtSlot, holdCreated, insightsSync, housekeeping, weeklyReports, siteChecks, campaignRun, autopilotDaily];
