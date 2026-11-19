import "server-only";
import { nid } from "./id";
import { enqueue } from "./inngest/client";
import { loadPost, retireCue, updatePost } from "./store";
import { db } from "./supabase/server";
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
    await retireCue(postId, status);
    return { note: `Marked ${status}.` };
  }
  const cueId = nid("cue");
  // "scheduled" is written before the job is sent. A job for a past slot runs at once and
  // takes the publish lock; writing "scheduled" after it would undo that lock and let
  // Publish now post the same line twice.
  await updatePost(postId, { status: "cued", cue_id: cueId, publish_state: "scheduled", publish_error: null });
  const queued = await enqueue("liftpage/post.cued", { postId, cueId, slot: post.slot }, `cue/${cueId}`);
  if (!queued) {
    // Only step back if nothing has touched this cue since.
    await db()
      .from("posts")
      .update({ publish_state: "idle", updated_at: new Date().toISOString() })
      .eq("id", postId)
      .eq("cue_id", cueId)
      .eq("publish_state", "scheduled");
    return { note: "Cued. Background jobs aren't set up, so it won't post at the slot. Use Publish now." };
  }
  const late = Date.parse(post.slot) <= Date.now();
  return { note: late ? "Cued. The slot has passed, so it goes out now." : "Cued. It posts at the slot." };
}
