import "server-only";
import { complete, type AiVia } from "../ai";
import { readSite, type SitePage } from "../read-site";
import type { Brand } from "../types";
import { NO_INVENTION, parseResearch, type Research } from "./parse";

function pageBlock(label: string, page: SitePage, limit: number): string {
  return [
    `--- ${label}: ${page.url}`,
    `Title: ${page.title || "unknown"}`,
    `Description: ${page.description || "unknown"}`,
    page.headings.length ? `Headings: ${page.headings.join(" | ")}` : "",
    `Text:\n${page.text.slice(0, limit)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Reads the company's site (and any competitor pages the operator gave) and sizes up the market. */
export async function runResearch(input: { url: string; competitors: string[]; brand: Brand }): Promise<{
  output: Research & { pagesRead: string[]; pagesFailed: string[] };
  via: AiVia;
  note: string;
}> {
  const site = await readSite(input.url);
  const rivals = await Promise.allSettled(input.competitors.map((url) => readSite(url)));
  const read = rivals.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failed = input.competitors.filter((_, index) => rivals[index].status === "rejected");

  const ask = [
    `You are the research agent for LiftPage, a marketing agency. The client board is ${input.brand.name}.`,
    "Study the company's website below, and the competitor pages if any were given.",
    "Fill every field from the pages. For competitors: list the ones given first (with their url); you may add up to three more you know of, without a url. Say in `angle` how each positions itself.",
    "`proofOnSite` holds only concrete facts printed on the company's site (customer names, numbers, awards). Leave it empty if there are none.",
    "`gaps` are openings the company could own in its marketing that competitors leave open.",
    NO_INVENTION,
    'Return JSON only: {"product":"","oneLiner":"","audience":[""],"painPoints":[""],"valueProps":[""],"proofOnSite":[""],"competitors":[{"name":"","url":"","angle":""}],"gaps":[""]}',
    "",
    pageBlock("Company site", site, 9000),
    ...read.map((page, index) => pageBlock(`Competitor ${index + 1}`, page, 2500)),
  ].join("\n");

  const urls = read.map((page) => page.url);
  const answer = await complete(ask, {
    system: "You are a careful market researcher. You return JSON only.",
    temperature: 0.2,
    maxOutputTokens: 2500,
    accept: (text) => parseResearch(text, urls) !== null,
  });
  if ("error" in answer) throw new Error(answer.error);
  const research = parseResearch(answer.text, urls)!;
  const note = [
    `Read ${site.url}${read.length ? ` and ${read.length} competitor page${read.length === 1 ? "" : "s"}` : ""}.`,
    failed.length ? `Couldn't read ${failed.join(", ")}.` : "",
    ...answer.notes,
  ]
    .filter(Boolean)
    .join(" ");
  return { output: { ...research, pagesRead: [site.url, ...urls], pagesFailed: failed }, via: answer.via, note };
}
