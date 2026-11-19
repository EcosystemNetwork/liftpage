import "server-only";
import { cutWeek } from "../cut";
import { addRun } from "../store";
import type { Brand, Post } from "../types";
import { writePiece } from "../write";
import { campaignBrief, type Research, type Strategy } from "./parse";

/*
 * The content agent writes with the tools the desk already uses: the week cutter for native
 * posts and the writer for a newsletter issue. They're separate calls so a job runner can
 * run them as two steps, each inside the host's time limit. Posts land on the board as
 * drafts; nothing goes out unapproved.
 */

export type ContentInput = { research: Research; strategy: Strategy; brand: Brand; goal: string; url: string };
export type Cut = { posts: Post[]; via: string; note: string };
export type Letter = { text?: string; note: string };

export function contentBrief(input: ContentInput): string {
  return campaignBrief(input.research, input.strategy, input.goal);
}

export async function writePosts(input: ContentInput): Promise<Cut> {
  // One model pass, not two: a campaign step has to finish inside the host's limit.
  return cutWeek(contentBrief(input), input.brand, { review: false });
}

/** Never throws: a missing newsletter shouldn't sink the posts. */
export async function writeNewsletter(input: ContentInput): Promise<Letter> {
  try {
    const letter = await writePiece("newsletter", input.brand, `${contentBrief(input)}\nLink to use for the call to action: ${input.url}`);
    return "text" in letter ? { text: letter.text, note: letter.note } : { note: `Newsletter skipped: ${letter.error}` };
  } catch (error) {
    return { note: `Newsletter skipped: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Saves the posts to the board as one run and returns the step's output. */
export async function saveContent(input: ContentInput, cut: Cut, letter: Letter) {
  await addRun(input.brand.id, `Campaign from ${input.url}\n\n${contentBrief(input)}`, {
    posts: cut.posts,
    via: cut.via as Parameters<typeof addRun>[2]["via"],
    note: cut.note,
  });
  return {
    output: {
      postIds: cut.posts.map((post) => post.id),
      posts: cut.posts.map((post) => ({ id: post.id, platform: post.platform, slot: post.slot, hook: post.hook })),
      newsletter: letter.text,
    },
    via: cut.via,
    note: [cut.note, letter.note].filter(Boolean).join(" "),
  };
}
