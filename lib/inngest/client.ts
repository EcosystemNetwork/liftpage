import "server-only";
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "liftpage" });

/** Inngest Cloud needs the event key; the local dev server needs INNGEST_DEV=1. */
export function jobsReady(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV);
}

export type Events = {
  "liftpage/post.cued": { postId: string; cueId: string; slot: string };
  "liftpage/hold.created": { holdId: string };
  "liftpage/insights.sync": { userId: string };
  "liftpage/campaign.requested": { campaignId: string };
};

/**
 * Sends an event when background jobs are set up. Returns false otherwise, so the caller
 * can do the work inline or say it won't happen.
 */
export async function enqueue<K extends keyof Events>(name: K, data: Events[K], id?: string): Promise<boolean> {
  if (!jobsReady()) return false;
  try {
    await inngest.send({ name, data, ...(id ? { id } : {}) });
    return true;
  } catch (error) {
    console.error("inngest send", error);
    return false;
  }
}
