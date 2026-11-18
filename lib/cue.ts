import "server-only";
import { nid } from "./id";
import { enqueue } from "./inngest/client";
import { loadPost, updatePost } from "./store";
import type { Status } from "./types";

/**
 * Moves a post between draft, approved, and cued. Cueing hands it to the scheduler with a
 * fresh cue id; anything else retires the old cue so a sleeping job stands down.
 * Returns a line for the operator.
 */
export async function setPostStatus(postId: string, status: Status): Promise<{ note: string } | { error: string }> {
  const found = await loadPost(postId);
  if (!found) return { error: "That post is not on the board." };
  const { post } = found;
  if (post.publishState === "published") return { error: "That post already went out. Make a new line instead." };
  if (post.publishState === "publishing") return { error: "That post is publishing right now." };

  if (status !== "cued") {
    await updatePost(postId, { status, cue_id: null, ...(post.publishState === "scheduled" ? { publish_state: "idle" } : {}) });
    return { note: `Marked ${status}.` };
  }
  const cueId = nid("cue");
  await updatePost(postId, { status: "cued", cue_id: cueId, publish_state: "idle", publish_error: null });
  const queued = await enqueue("liftpage/post.cued", { postId, cueId, slot: post.slot }, `cue/${cueId}`);
  if (!queued) return { note: "Cued. Background jobs aren't set up, so it won't post at the slot. Use Publish now." };
  await updatePost(postId, { publish_state: "scheduled" });
  const late = Date.parse(post.slot) <= Date.now();
  return { note: late ? "Cued. The slot has passed, so it goes out now." : "Cued. It posts at the slot." };
}
