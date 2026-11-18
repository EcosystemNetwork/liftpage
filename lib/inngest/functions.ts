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

export const functions = [publishAtSlot, holdCreated, insightsSync, housekeeping, weeklyReports, siteChecks];
