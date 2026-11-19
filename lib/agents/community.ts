import "server-only";
import { complete, type AiVia } from "../ai";
import type { Brand } from "../types";
import { NO_INVENTION, parseCommunity, type Community, type Research, type Strategy } from "./parse";

/**
 * Finds where the audience already gathers and drafts how to show up there. It names
 * communities (to be checked by a person) but never individual creators: it hands back
 * searches that find them, so nobody gets pitched on a model's guess.
 */
export async function runCommunity(input: { research: Research; strategy: Strategy; brand: Brand; goal: string; url: string }): Promise<{
  output: Community;
  via: AiVia;
  note: string;
}> {
  const { research, strategy, brand } = input;
  const ask = [
    `You are the community agent for LiftPage, planning outreach for ${research.product}: ${research.oneLiner}`,
    `Audience: ${research.audience.join("; ") || "unknown"}`,
    `Positioning: ${strategy.positioning}`,
    input.goal ? `Campaign goal: ${input.goal}` : "Goal: qualified visits to the site.",
    `The brand posts on: ${brand.platforms.join(", ")}. Voice: ${brand.voice}`,
    "1. `communities`: up to 6 places this audience already talks (subreddits, Slack/Discord groups, forums, LinkedIn groups, newsletters). Only real, well-known ones you are confident exist. Say where it lives, why it fits, and the etiquette (most ban self-promotion: say how to contribute first).",
    "2. `creatorSearches`: do NOT name individual creators or influencers. Give up to 6 search queries (hashtags or keywords) on the brand's networks that would find creators this audience follows, and what a good fit looks like.",
    "3. `outreach`: up to 3 short first-message drafts (one per kind of recipient: a creator, a community moderator, a newsletter writer). Address the person as [NAME] and their work as [THEIR WORK]. Offer something useful before asking for anything. No fake familiarity.",
    `4. \`cautions\`: what could go wrong (spam rules, disclosure of paid partnerships). Link to use: ${input.url}`,
    NO_INVENTION,
    'Return JSON only: {"communities":[{"name":"","where":"","why":"","etiquette":""}],"creatorSearches":[{"platform":"x|linkedin|instagram|tiktok|youtube","query":"","fit":""}],"outreach":[{"to":"","channel":"","subject":"","message":""}],"cautions":[""]}',
  ].join("\n");
  const answer = await complete(ask, {
    system: "You are a community and partnerships lead. You return JSON only.",
    temperature: 0.5,
    maxOutputTokens: 2500,
    accept: (text) => parseCommunity(text) !== null,
  });
  if ("error" in answer) throw new Error(answer.error);
  return { output: parseCommunity(answer.text)!, via: answer.via, note: answer.notes.join(" ") };
}
