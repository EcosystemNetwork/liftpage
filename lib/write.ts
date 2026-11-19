import "server-only";
import { complete, harnessName, type AiVia } from "./ai";
import { FORMATS, type FormatId } from "./formats";
import type { Brand } from "./types";

export { FORMATS, isFormat, type FormatId } from "./formats";

/*
 * Long-form and campaign writing for the services that aren't a week of posts. Each format
 * is a brief to the model; the answer comes back as plain text for a person to edit, approve,
 * and send. Nothing here publishes or stores anything.
 */

export async function writePiece(format: FormatId, brand: Brand, brief: string): Promise<{ text: string; via: AiVia; note: string } | { error: string }> {
  const spec = FORMATS[format];
  const ask = [
    `You write for LiftPage, a social media agency, on behalf of ${brand.name} (${brand.handle}).`,
    `Voice: ${brand.voice}`,
    `Offer: ${brand.offers}`,
    `Networks: ${brand.platforms.join(", ")}.`,
    `Task (${spec.label}): ${spec.ask}`,
    "Rules: plain language, no hype words, no emoji, no hashtag walls. Keep every fact from the brief. Never invent numbers, customers, quotes, prices, names, or dates; put a [BRACKETED PLACEHOLDER] where one is needed.",
    "Return plain text with simple headings. No preamble, no sign-off about being an AI.",
    "",
    `Brief: ${brief}`,
  ].join("\n");
  const answer = await complete(ask, {
    system: "You are a senior marketing writer. You return finished copy, ready for a person to review.",
    temperature: 0.6,
    maxOutputTokens: 4000,
    accept: (text) => text.trim().length > 80,
  });
  if ("error" in answer) return { error: answer.error };
  const name = answer.via === "tokenrouter" ? "TokenRouter" : `HarnessRouter (${harnessName()})`;
  return { text: answer.text.trim(), via: answer.via, note: [...answer.notes, `${name} wrote it.`].join(" ") };
}
