import type { AgentId } from "../types";

/*
 * The six agents, in the order a campaign runs them. Plain data so the desk can render the
 * rail; the model calls live next to this file. `ready: false` agents are created as
 * skipped steps until they're wired in.
 */
export const AGENT_ROSTER: { id: AgentId; label: string; job: string; ready: boolean }[] = [
  { id: "research", label: "Research", job: "Reads the site and any competitor pages: product, audience, proof, gaps.", ready: true },
  { id: "strategy", label: "Strategy", job: "Positioning, three messaging pillars, a channel plan, and seven days of themes.", ready: true },
  { id: "content", label: "Content", job: "Cuts native posts for each network and a newsletter issue, as drafts.", ready: true },
  { id: "distribution", label: "Distribution", job: "Slots the approved posts and tags every link for tracking.", ready: true },
  { id: "community", label: "Community", job: "Finds communities and creator profiles to reach, and drafts outreach.", ready: true },
  { id: "analyst", label: "Growth analyst", job: "Reads the numbers and proposes next week's experiments.", ready: true },
];
