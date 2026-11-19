import "server-only";
import { CAPTION_LIMIT } from "../cut";
import { loadPost, updatePost } from "../store";
import { campaignTag, planDistribution, tagLinks, utmLink, type Placement } from "./distribute";
import type { Strategy } from "./parse";

export type Distribution = {
  campaignTag: string;
  landing: string;
  placements: Omit<Placement, "caption">[];
  newsletterLink: string;
  newsletter?: string;
  skipped: string[];
};

/**
 * Slots the campaign's drafts across the week at each network's posting windows and tags
 * every link for tracking. Only drafts nobody has touched move: anything approved, cued,
 * or publishing is left exactly as it is. Nothing is scheduled; people still approve.
 */
export async function runDistribution(input: {
  campaignId: string;
  createdAt: string;
  landing: string;
  postIds: string[];
  strategy: Strategy;
  newsletter?: string;
}): Promise<{ output: Distribution; note: string }> {
  const tag = campaignTag(input.campaignId, input.createdAt);
  const loaded = await Promise.all(input.postIds.map((id) => loadPost(id)));
  const skipped: string[] = [];
  const posts = loaded.flatMap((found, index) => {
    if (!found) {
      skipped.push(`${input.postIds[index]}: gone`);
      return [];
    }
    const { post } = found;
    if (post.status !== "draft" || post.publishState !== "idle") {
      skipped.push(`${post.id}: already ${post.status}`);
      return [];
    }
    return [{ id: post.id, platform: post.platform, slot: post.slot, caption: post.caption }];
  });

  const placements = planDistribution({ posts, landing: input.landing, campaign: tag, days: input.strategy.days.length, limits: CAPTION_LIMIT });
  const before = new Map(posts.map((post) => [post.id, post]));
  for (const placement of placements) {
    const was = before.get(placement.postId)!;
    const patch: { slot?: string; caption?: string } = {};
    if (placement.slot !== was.slot) patch.slot = placement.slot;
    if (placement.caption !== was.caption) patch.caption = placement.caption;
    if (Object.keys(patch).length) await updatePost(placement.postId, patch);
  }

  const newsletterLink = utmLink(input.landing, { source: "newsletter", medium: "email", campaign: tag });
  const newsletter = input.newsletter ? (tagLinks(input.newsletter, input.landing, newsletterLink) ?? input.newsletter) : undefined;
  const inCaption = placements.filter((item) => item.linkPlacement === "caption").length;
  const bio = placements.filter((item) => item.linkPlacement === "bio").length;
  const note = [
    `${placements.length} drafts slotted over ${input.strategy.days.length} days, tagged ${tag}.`,
    `${inCaption} links tagged in captions${bio ? `, ${bio} use the bio link` : ""}.`,
    skipped.length ? `${skipped.length} left alone (already moving).` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    output: {
      campaignTag: tag,
      landing: input.landing,
      placements: placements.map((item) => ({
        postId: item.postId,
        platform: item.platform,
        day: item.day,
        slot: item.slot,
        content: item.content,
        link: item.link,
        linkPlacement: item.linkPlacement,
      })),
      newsletterLink,
      newsletter,
      skipped,
    },
    note,
  };
}
