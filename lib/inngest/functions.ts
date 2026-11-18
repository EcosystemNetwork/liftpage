import "server-only";
import { notifyHold } from "../notify";
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

export const functions = [publishAtSlot, holdCreated, insightsSync, housekeeping];
