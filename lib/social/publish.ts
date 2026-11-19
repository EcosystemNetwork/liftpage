import "server-only";
import { track } from "../analytics";
import { claimPublish, loadPost, MEDIA_BUCKET, updatePost } from "../store";
import { db } from "../supabase/server";
import type { Platform, Post } from "../types";
import { accountFor, call, LINKEDIN_VERSION, SocialError, type Account } from "./oauth";

type Media = { url: string; type: string; path: string } | undefined;
type Published = { url?: string; note?: string };

const isVideo = (media: Media) => Boolean(media?.type.startsWith("video/"));

async function bytes(media: NonNullable<Media>): Promise<Buffer> {
  const { data, error } = await db().storage.from(MEDIA_BUCKET).download(media.path);
  if (error || !data) throw new Error(`Couldn't read the media file: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

function needVideo(platform: Platform, media: Media): asserts media is NonNullable<Media> {
  if (!media || !isVideo(media)) throw new SocialError(platform, "This network takes video. Upload one to the line first.");
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- X ---------- */

async function publishX(account: Account, post: Post): Promise<Published> {
  const text = post.caption.trim() || post.hook;
  if ([...text].length > 280) throw new SocialError("x", `The caption is ${[...text].length} characters. X takes 280.`);
  const { body } = await call<{ data: { id: string } }>("x", "https://api.x.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const handle = account.accountName.replace(/^@/, "") || "i";
  return { url: `https://x.com/${handle}/status/${body.data.id}`, note: post.mediaUrl ? "Posted as text. Attach media on X by hand." : undefined };
}

/* ---------- LinkedIn ---------- */

async function publishLinkedIn(account: Account, post: Post): Promise<Published> {
  const { headers } = await call("linkedin", "https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: account.accountId,
      commentary: post.caption.trim() || post.hook,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  const urn = headers.get("x-restli-id") ?? headers.get("x-linkedin-id");
  return {
    url: urn ? `https://www.linkedin.com/feed/update/${urn}` : undefined,
    note: post.mediaUrl ? "Posted as text. Attach media on LinkedIn by hand." : undefined,
  };
}

/* ---------- Instagram ---------- */

async function publishInstagram(account: Account, post: Post, media: Media): Promise<Published> {
  if (!media) throw new SocialError("instagram", "Instagram needs an image or a video. Upload one to the line first.");
  const base = `https://graph.instagram.com/${account.accountId}`;
  const auth = { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" };
  const container = await call<{ id: string }>("instagram", `${base}/media`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(
      isVideo(media)
        ? { media_type: "REELS", video_url: media.url, caption: post.caption }
        : { image_url: media.url, caption: post.caption },
    ),
  });
  const id = container.body.id;
  // Instagram fetches and processes the file before it can publish. Up to ~5 minutes.
  for (let i = 0; i < 60; i++) {
    const { body } = await call<{ status_code?: string }>("instagram", `https://graph.instagram.com/${id}?fields=status_code`, { headers: auth });
    if (body.status_code === "FINISHED" || (!isVideo(media) && !body.status_code)) break;
    if (body.status_code === "ERROR" || body.status_code === "EXPIRED") {
      throw new SocialError("instagram", `Instagram couldn't process the media (${body.status_code}).`);
    }
    if (i === 59) throw new SocialError("instagram", "Instagram is still processing the media. Try again in a few minutes.");
    await wait(5000);
  }
  const published = await call<{ id: string }>("instagram", `${base}/media_publish`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ creation_id: id }),
  });
  const link = await call<{ permalink?: string }>(
    "instagram",
    `https://graph.instagram.com/${published.body.id}?fields=permalink`,
    { headers: auth },
  ).catch(() => null);
  return { url: link?.body.permalink };
}

/* ---------- YouTube ---------- */

async function publishYouTube(account: Account, post: Post, media: Media): Promise<Published> {
  needVideo("youtube", media);
  const file = await bytes(media);
  const privacy = process.env.YOUTUBE_PRIVACY || "public";
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(file.length),
      "X-Upload-Content-Type": media.type,
    },
    body: JSON.stringify({
      snippet: { title: (post.hook || post.caption).slice(0, 100), description: post.caption.slice(0, 5000), categoryId: "22" },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const location = start.headers.get("location");
  if (!start.ok || !location) throw new SocialError("youtube", `${start.status} ${(await start.text()).slice(0, 300)}`);
  const { body } = await call<{ id: string }>("youtube", location, {
    method: "PUT",
    headers: { "Content-Type": media.type, "Content-Length": String(file.length) },
    body: new Uint8Array(file),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  return {
    url: `https://www.youtube.com/watch?v=${body.id}`,
    note: privacy === "public" ? "Unverified Google API projects have uploads locked to private until Google audits the app." : undefined,
  };
}

/* ---------- TikTok ---------- */

async function publishTikTok(account: Account, post: Post, media: Media): Promise<Published> {
  needVideo("tiktok", media);
  const auth = { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json; charset=UTF-8" };
  const creator = await call<{ data: { privacy_level_options: string[] } }>(
    "tiktok",
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    { method: "POST", headers: auth, body: "{}" },
  );
  const options = creator.body.data.privacy_level_options ?? [];
  // Until TikTok audits the app, only SELF_ONLY is allowed.
  const wanted = process.env.TIKTOK_PRIVACY || "SELF_ONLY";
  const privacy = options.includes(wanted) ? wanted : options.includes("SELF_ONLY") ? "SELF_ONLY" : options[0];
  if (!privacy) throw new SocialError("tiktok", "TikTok offered no privacy level for this account.");

  const file = await bytes(media);
  const size = file.length;
  const MB = 1024 * 1024;
  // One chunk up to 64 MB; above that, 10 MB chunks with the remainder on the last.
  const chunk = size <= 64 * MB ? size : 10 * MB;
  const count = size <= 64 * MB ? 1 : Math.floor(size / chunk);
  const init = await call<{ data: { publish_id: string; upload_url: string } }>(
    "tiktok",
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        post_info: { title: post.caption.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
        source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: count },
      }),
    },
  );
  for (let i = 0; i < count; i++) {
    const from = i * chunk;
    const to = i === count - 1 ? size - 1 : from + chunk - 1;
    const part = file.subarray(from, to + 1);
    const put = await fetch(init.body.data.upload_url, {
      method: "PUT",
      headers: { "Content-Type": media.type, "Content-Length": String(part.length), "Content-Range": `bytes ${from}-${to}/${size}` },
      body: new Uint8Array(part),
      signal: AbortSignal.timeout(5 * 60_000),
    });
    if (!put.ok) throw new SocialError("tiktok", `Upload chunk ${i + 1}/${count} failed: ${put.status}`);
  }
  return {
    note:
      privacy === "SELF_ONLY"
        ? "Sent to TikTok as private (SELF_ONLY). TikTok allows public posts only after it audits the app."
        : "Sent to TikTok. It shows on the profile once TikTok finishes processing.",
  };
}

const PUBLISHERS: Record<Platform, (account: Account, post: Post, media: Media) => Promise<Published>> = {
  x: publishX,
  linkedin: publishLinkedIn,
  instagram: publishInstagram,
  youtube: publishYouTube,
  tiktok: publishTikTok,
};

export type PublishOutcome = { ok: true; url?: string; note?: string } | { ok: false; error: string; skipped?: boolean };

/**
 * Publishes one post to its network. Safe to call twice: the claim lets one caller
 * through. With a cueId (from a scheduled job), stands down if the post was re-cued,
 * un-cued, or already went out.
 */
export async function publishPost(postId: string, cueId?: string): Promise<PublishOutcome> {
  const found = await loadPost(postId);
  if (!found) return { ok: false, error: "That post is gone.", skipped: true };
  if (!(await claimPublish(postId, cueId))) {
    return { ok: false, error: "Already published, publishing, or no longer cued.", skipped: true };
  }
  const { post, brandId, mediaPath } = found;
  const media: Media = mediaPath && post.mediaUrl ? { url: post.mediaUrl, type: post.mediaType ?? "", path: mediaPath } : undefined;
  try {
    const account = await accountFor(brandId, post.platform);
    const result = await PUBLISHERS[post.platform](account, post, media);
    await updatePost(postId, {
      publish_state: "published",
      published_url: result.url ?? null,
      published_at: new Date().toISOString(),
      publish_error: result.note ?? null,
    });
    await track(brandId, "post_published", { platform: post.platform });
    return { ok: true, url: result.url, note: result.note };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updatePost(postId, { publish_state: "failed", publish_error: message.slice(0, 500) });
    await track(brandId, "post_publish_failed", { platform: post.platform });
    return { ok: false, error: message };
  }
}
