import "server-only";
import { loadEvents, weeklyReportsOn } from "./admin";
import { loadAutopilot } from "./autopilot";
import { pendingDrafts, PENDING_LIMIT } from "./autopilot-plan";
import { latestCampaign } from "./campaigns";
import { emailReady } from "./email";
import { buildServices, workLog, type Service, type WorkItem } from "./services";
import type { Brand, Connection, Metric, Post, Project, User } from "./types";

/**
 * Reads what the services panel and work log need for one client. Anything optional
 * (autopilot, campaigns, the log) degrades to "off" or empty instead of failing the page.
 */
export async function loadServices(input: {
  user: Pick<User, "id" | "tools">;
  board: { brand: Brand; posts: Post[] } | null;
  connections: Connection[];
  metrics: Metric[];
  projects: Project[];
}): Promise<{ services: Service[]; log: WorkItem[] }> {
  const { user, board, connections, metrics, projects } = input;
  const [autopilot, campaign, events] = await Promise.all([
    board ? loadAutopilot(user.id) : null,
    board
      ? latestCampaign(board.brand.id).catch((error) => {
          console.error("services campaign", error);
          return null;
        })
      : null,
    loadEvents({ clientId: user.id, limit: 60 }),
  ]);
  const posts = board?.posts ?? [];
  const lastSync = metrics.filter((m) => m.source === "sync").reduce<string | null>((max, m) => (max === null || m.at > max ? m.at : max), null);
  const services = buildServices({
    now: new Date(),
    posts,
    connections,
    autopilot,
    campaign,
    projects,
    lastSync,
    reportsOn: weeklyReportsOn() && emailReady(),
    lastReport: events.find((e) => e.action === "report sent")?.at,
    tools: user.tools.length,
    pending: pendingDrafts(posts),
    pendingLimit: PENDING_LIMIT,
  });
  return { services, log: workLog(events, posts) };
}
