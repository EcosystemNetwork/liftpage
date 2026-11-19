import "server-only";
import { PostHog } from "posthog-node";

let client: PostHog | undefined;

/**
 * Server-side product events. No-op without NEXT_PUBLIC_POSTHOG_KEY. Never pass emails
 * or names in properties; the distinct id is a user, hold, or anonymous id.
 */
export async function track(distinctId: string, event: string, properties: Record<string, string | number | boolean | null> = {}) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  client ??= new PostHog(key, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com", flushAt: 1, flushInterval: 0 });
  try {
    await client.captureImmediate({ distinctId, event, properties });
  } catch (error) {
    console.error("posthog", error);
  }
}
