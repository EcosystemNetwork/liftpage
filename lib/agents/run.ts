import "server-only";
import { safeErr } from "../ai";
import { claimCampaign, finishCampaign, loadCampaign, setStep } from "../campaigns";
import { loadBrand } from "../store";
import type { AgentId } from "../types";
import { runContent } from "./content";
import type { Research, Strategy } from "./parse";
import { runResearch } from "./research";
import { runStrategy } from "./strategy";

/**
 * Runs a queued campaign agent by agent, writing each step's status as it goes so the desk
 * can watch. A failed step stops the run: later agents are marked skipped, and everything
 * already produced stays readable. Output only ever lands as drafts.
 */
export async function runCampaign(id: string): Promise<void> {
  if (!(await claimCampaign(id))) return;
  const campaign = await loadCampaign(id);
  const brand = campaign ? await loadBrand(campaign.brandId) : null;
  if (!campaign || !brand) {
    await finishCampaign(id, "failed");
    return;
  }

  let research: Research | undefined;
  let strategy: Strategy | undefined;
  let postIds: string[] = [];

  const stages: { agent: AgentId; run: () => Promise<{ output: unknown; via: string; note: string }> }[] = [
    {
      agent: "research",
      run: async () => {
        const result = await runResearch({ url: campaign.url, competitors: campaign.competitors, brand });
        research = result.output;
        return result;
      },
    },
    {
      agent: "strategy",
      run: async () => {
        const result = await runStrategy({ research: research!, brand, goal: campaign.goal });
        strategy = result.output;
        return result;
      },
    },
    {
      agent: "content",
      run: async () => {
        const result = await runContent({ research: research!, strategy: strategy!, brand, goal: campaign.goal, url: campaign.url });
        postIds = result.output.postIds;
        return result;
      },
    },
  ];

  for (let index = 0; index < stages.length; index++) {
    const { agent, run } = stages[index];
    await setStep(id, agent, { status: "running" });
    try {
      const result = await run();
      await setStep(id, agent, { status: "done", output: result.output, via: result.via, note: result.note });
    } catch (error) {
      await setStep(id, agent, { status: "failed", error: safeErr(error) });
      for (const later of stages.slice(index + 1)) {
        await setStep(id, later.agent, { status: "skipped", note: `Stopped: ${agent} failed.` });
      }
      await finishCampaign(id, "failed", { memory: { research, strategy } });
      return;
    }
  }
  await finishCampaign(id, "ready", { postIds, memory: { research, strategy } });
}
