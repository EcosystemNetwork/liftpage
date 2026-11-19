import "server-only";
import { cutWeek } from "../cut";
import { addRun } from "../store";
import type { Brand } from "../types";
import { writePiece } from "../write";
import { campaignBrief, type Research, type Strategy } from "./parse";

/**
 * Writes the campaign with the tools the desk already uses: the week cutter for native posts
 * (saved to the board as drafts, so nothing goes out unapproved) and the writer for a
 * newsletter issue. Both run at once.
 */
export async function runContent(input: { research: Research; strategy: Strategy; brand: Brand; goal: string; url: string }) {
  const brief = campaignBrief(input.research, input.strategy, input.goal);
  const newsletterBrief = `${brief}\nLink to use for the call to action: ${input.url}`;
  const [cut, letter] = await Promise.all([cutWeek(brief, input.brand), writePiece("newsletter", input.brand, newsletterBrief)]);
  await addRun(input.brand.id, `Campaign from ${input.url}\n\n${brief}`, cut);
  const newsletter = "text" in letter ? letter.text : undefined;
  const notes = [cut.note, "text" in letter ? letter.note : `Newsletter skipped: ${letter.error}`];
  return {
    output: {
      postIds: cut.posts.map((post) => post.id),
      posts: cut.posts.map((post) => ({ id: post.id, platform: post.platform, slot: post.slot, hook: post.hook })),
      newsletter,
    },
    via: cut.via,
    note: notes.join(" "),
  };
}
