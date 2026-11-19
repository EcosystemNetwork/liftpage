import "server-only";
import { safeErr } from "../ai";
import { claimCampaign, finishCampaign, loadCampaign, recordDrafts, setStep } from "../campaigns";
import { loadBrand } from "../store";
import type { AgentId, Brand, Campaign } from "../types";
import { saveContent, writeNewsletter, writePosts, type ContentInput, type Cut, type Letter } from "./content";
import { runAnalyst } from "./analyst";
import { runCommunity } from "./community";
import { runDistribution } from "./distribution";
import type { Research, Strategy } from "./parse";
import { runResearch } from "./research";
import { runStrategy } from "./strategy";

/*
 * A campaign runs as stages, each about one model call, so a job runner (Inngest) can give
 * every stage its own request and its own time limit. Each stage writes its agent's status
 * as it goes, so the desk can watch. A failed stage stops the run: later agents are marked
 * skipped, and everything already produced stays readable. Output only ever lands as drafts.
 *
 * Stages return null after a failure; the caller just stops.
 *
 * Distribution, Community and Analyst run after the drafts are saved. Their failures are
 * soft: the step shows the error, but the campaign still ends ready, because the drafts
 * the client is paying for already exist.
 */

const PIPELINE: AgentId[] = ["research", "strategy", "content", "distribution", "community", "analyst"];

type Loaded = { campaign: Campaign; brand: Brand };

async function load(id: string): Promise<Loaded | null> {
  const campaign = await loadCampaign(id);
  const brand = campaign ? await loadBrand(campaign.brandId) : null;
  return campaign && brand ? { campaign, brand } : null;
}

async function fail(id: string, agent: AgentId, error: unknown, memory: { research?: Research; strategy?: Strategy } = {}) {
  await setStep(id, agent, { status: "failed", error: safeErr(error) });
  for (const later of PIPELINE.slice(PIPELINE.indexOf(agent) + 1)) {
    await setStep(id, later, { status: "skipped", note: `Stopped: ${agent} failed.` });
  }
  await finishCampaign(id, "failed", { memory });
}

/** Takes a queued campaign. False if it's gone or another runner already has it. */
export async function beginCampaign(id: string): Promise<boolean> {
  if (!(await claimCampaign(id))) return false;
  if (await load(id)) return true;
  await finishCampaign(id, "failed");
  return false;
}

export async function researchStage(id: string): Promise<Research | null> {
  const loaded = await load(id);
  if (!loaded) return null;
  await setStep(id, "research", { status: "running" });
  try {
    const { campaign, brand } = loaded;
    const result = await runResearch({ url: campaign.url, competitors: campaign.competitors, brand });
    await setStep(id, "research", { status: "done", output: result.output, via: result.via, note: result.note });
    return result.output;
  } catch (error) {
    await fail(id, "research", error);
    return null;
  }
}

export async function strategyStage(id: string, research: Research): Promise<Strategy | null> {
  const loaded = await load(id);
  if (!loaded) return null;
  await setStep(id, "strategy", { status: "running" });
  try {
    const result = await runStrategy({ research, brand: loaded.brand, goal: loaded.campaign.goal });
    await setStep(id, "strategy", { status: "done", output: result.output, via: result.via, note: result.note });
    return result.output;
  } catch (error) {
    await fail(id, "strategy", error, { research });
    return null;
  }
}

async function contentInput(id: string, research: Research, strategy: Strategy): Promise<ContentInput | null> {
  const loaded = await load(id);
  if (!loaded) return null;
  return { research, strategy, brand: loaded.brand, goal: loaded.campaign.goal, url: loaded.campaign.url };
}

/** Marks Content as working. Separate so parallel post/newsletter stages don't race on it. */
export async function contentStart(id: string) {
  await setStep(id, "content", { status: "running", note: "Writing posts and a newsletter." });
}

export async function postsStage(id: string, research: Research, strategy: Strategy): Promise<Cut | null> {
  const input = await contentInput(id, research, strategy);
  if (!input) return null;
  try {
    return await writePosts(input);
  } catch (error) {
    await fail(id, "content", error, { research, strategy });
    return null;
  }
}

export async function newsletterStage(id: string, research: Research, strategy: Strategy): Promise<Letter> {
  const input = await contentInput(id, research, strategy);
  return input ? writeNewsletter(input) : { note: "" };
}

/** Saves the drafts and closes the Content step. The campaign stays running for the later agents. */
export async function finishStage(id: string, research: Research, strategy: Strategy, cut: Cut, letter: Letter): Promise<string[] | null> {
  const input = await contentInput(id, research, strategy);
  if (!input) return null;
  try {
    const result = await saveContent(input, cut, letter);
    await setStep(id, "content", { status: "done", output: result.output, via: result.via, note: result.note });
    await recordDrafts(id, result.output.postIds, { research, strategy });
    return result.output.postIds;
  } catch (error) {
    await fail(id, "content", error, { research, strategy });
    return null;
  }
}

/** Marks a later agent failed without failing the campaign. */
async function softFail(id: string, agent: AgentId, error: unknown) {
  await setStep(id, agent, { status: "failed", error: safeErr(error), note: "The drafts are safe; this agent's part is missing." });
}

export type Tracking = { campaignTag?: string };

/** Slots the drafts over the week and tags their links. No model call. */
export async function distributionStage(id: string, postIds: string[], strategy: Strategy, newsletter?: string): Promise<Tracking> {
  const loaded = await load(id);
  if (!loaded) return {};
  await setStep(id, "distribution", { status: "running" });
  try {
    const { campaign } = loaded;
    const result = await runDistribution({ campaignId: id, createdAt: campaign.createdAt, landing: campaign.url, postIds, strategy, newsletter });
    await setStep(id, "distribution", { status: "done", output: result.output, via: "local", note: result.note });
    return { campaignTag: result.output.campaignTag };
  } catch (error) {
    await softFail(id, "distribution", error);
    return {};
  }
}

export async function communityStage(id: string, research: Research, strategy: Strategy): Promise<boolean> {
  const loaded = await load(id);
  if (!loaded) return false;
  await setStep(id, "community", { status: "running" });
  try {
    const { campaign, brand } = loaded;
    const result = await runCommunity({ research, strategy, brand, goal: campaign.goal, url: campaign.url });
    await setStep(id, "community", { status: "done", output: result.output, via: result.via, note: result.note });
    return true;
  } catch (error) {
    await softFail(id, "community", error);
    return false;
  }
}

export async function analystStage(id: string, research: Research, strategy: Strategy, tracking: Tracking): Promise<boolean> {
  const loaded = await load(id);
  if (!loaded) return false;
  await setStep(id, "analyst", { status: "running" });
  try {
    const { campaign, brand } = loaded;
    const result = await runAnalyst({ research, strategy, brand, goal: campaign.goal, campaignTag: tracking.campaignTag });
    await setStep(id, "analyst", { status: "done", output: result.output, via: result.via, note: result.note });
    return true;
  } catch (error) {
    await softFail(id, "analyst", error);
    return false;
  }
}

/** Closes the campaign once every agent has had its turn. */
export async function wrapStage(id: string, postIds: string[], research: Research, strategy: Strategy) {
  await finishCampaign(id, "ready", { postIds, memory: { research, strategy } });
}

/** Runs every stage in this process. Used when background jobs aren't set up (local dev). */
export async function runCampaign(id: string): Promise<void> {
  if (!(await beginCampaign(id))) return;
  const research = await researchStage(id);
  if (!research) return;
  const strategy = await strategyStage(id, research);
  if (!strategy) return;
  await contentStart(id);
  const [cut, letter] = await Promise.all([postsStage(id, research, strategy), newsletterStage(id, research, strategy)]);
  if (!cut) return;
  const postIds = await finishStage(id, research, strategy, cut, letter);
  if (!postIds) return;
  const tracking = await distributionStage(id, postIds, strategy, letter.text);
  await Promise.all([communityStage(id, research, strategy), analystStage(id, research, strategy, tracking)]);
  await wrapStage(id, postIds, research, strategy);
}
