import "server-only";
import { complete, type AiVia } from "../ai";
import type { Brand } from "../types";
import { NO_INVENTION, parseStrategy, type Research, type Strategy } from "./parse";

/** Turns the research into positioning, pillars, a channel plan, and seven days of themes. */
export async function runStrategy(input: {
  research: Research;
  brand: Brand;
  goal: string;
  /** The brand's last finished campaign strategy, if any, so this week builds on it. */
  previous?: { strategy: Strategy; at: string };
}): Promise<{ output: Strategy; via: AiVia; note: string }> {
  const { research, brand, previous } = input;
  const earlier = previous
    ? [
        `This brand ran a campaign on ${previous.at.slice(0, 10)}. Its strategy is below. Keep the positioning and pillars that still fit the research; do not repeat its daily themes, so this week feels new.`,
        `Previous strategy:\n${JSON.stringify(previous.strategy)}`,
      ]
    : [];
  const ask = [
    `You are the strategy agent for LiftPage, planning a 7-day launch campaign for ${research.product}.`,
    `The brand posts on: ${brand.platforms.join(", ")}. Only plan channels from that list.`,
    `Brand voice: ${brand.voice}`,
    input.goal ? `Campaign goal from the operator: ${input.goal}` : "No goal was given: aim for qualified visits to the site.",
    "Write a positioning line, exactly three messaging pillars, why and how often to use each channel, one theme per day for seven days (each with an objective and a plain call to action), and the KPIs to watch.",
    "Lean on the gaps the research found. Each day should be different in kind (demo, problem, proof, behind the scenes, comparison, community, recap).",
    NO_INVENTION,
    'Return JSON only: {"positioning":"","pillars":["","",""],"channels":[{"platform":"x|linkedin|instagram|tiktok|youtube","why":"","cadence":""}],"days":[{"day":1,"theme":"","objective":"","cta":""}],"kpis":[""]}',
    "",
    `Research:\n${JSON.stringify(research)}`,
    ...earlier,
  ].join("\n");
  const answer = await complete(ask, {
    system: "You are a senior growth strategist. You return JSON only.",
    temperature: 0.4,
    maxOutputTokens: 2500,
    accept: (text) => parseStrategy(text) !== null,
  });
  if ("error" in answer) throw new Error(answer.error);
  const built = previous ? `Built on the ${previous.at.slice(0, 10)} campaign.` : "";
  return { output: parseStrategy(answer.text)!, via: answer.via, note: [built, ...answer.notes].filter(Boolean).join(" ") };
}
