import "server-only";
import { complete, type AiVia } from "../ai";
import type { Brand } from "../types";
import { NO_INVENTION, parseStrategy, type Research, type Strategy } from "./parse";

/** Turns the research into positioning, pillars, a channel plan, and seven days of themes. */
export async function runStrategy(input: { research: Research; brand: Brand; goal: string }): Promise<{ output: Strategy; via: AiVia; note: string }> {
  const { research, brand } = input;
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
  ].join("\n");
  const answer = await complete(ask, {
    system: "You are a senior growth strategist. You return JSON only.",
    temperature: 0.4,
    maxOutputTokens: 2500,
    accept: (text) => parseStrategy(text) !== null,
  });
  if ("error" in answer) throw new Error(answer.error);
  return { output: parseStrategy(answer.text)!, via: answer.via, note: answer.notes.join(" ") };
}
