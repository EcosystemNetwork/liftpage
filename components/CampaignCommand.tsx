"use client";

import { useEffect, useRef, useState } from "react";
import type { Research, Strategy } from "@/lib/agents/parse";
import { AGENT_ROSTER } from "@/lib/agents/roster";
import { PLATFORM_NAME, type AgentStep, type Campaign, type Platform, type StepStatus } from "@/lib/types";

const VIA_NAME: Record<string, string> = {
  harnessrouter: "HarnessRouter",
  tokenrouter: "TokenRouter",
  both: "TokenRouter + HarnessRouter",
  local: "Local operator",
};

const STATUS_STYLE: Record<StepStatus, string> = {
  queued: "border-line text-muted",
  running: "border-accent bg-accent-soft text-ink",
  done: "border-ink bg-ink text-canvas",
  failed: "border-danger bg-danger-soft text-danger",
  skipped: "border-line text-muted line-through decoration-1",
};

function seconds(step: AgentStep, now: number): string {
  if (!step.startedAt) return "";
  const end = step.finishedAt ? Date.parse(step.finishedAt) : now;
  return `${Math.max(0, Math.round((end - Date.parse(step.startedAt)) / 1000))}s`;
}

const active = (campaign: Campaign | null) => campaign?.status === "queued" || campaign?.status === "running";

/** Website in, campaign out: starts the agents and shows each one's work as it lands. */
export function CampaignCommand({ brandId, onDrafts }: { brandId: string; onDrafts: (postIds: string[]) => void }) {
  const [url, setUrl] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [goal, setGoal] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef<string>("");

  // Pick up the board's latest campaign, so a reload mid-run keeps watching it.
  useEffect(() => {
    let live = true;
    fetch(`/api/campaign?board=${encodeURIComponent(brandId)}`)
      .then((response) => response.json())
      .then((payload: { campaign?: Campaign | null }) => {
        if (live && payload.campaign) {
          setCampaign(payload.campaign);
          announced.current = payload.campaign.status === "ready" ? payload.campaign.id : "";
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [brandId]);

  const running = active(campaign);
  const campaignId = campaign?.id;

  useEffect(() => {
    if (!running || !campaignId) return;
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/campaign/${campaignId}`);
        const payload = (await response.json()) as { campaign?: Campaign; error?: string };
        if (payload.campaign) setCampaign(payload.campaign);
      } catch {
        // A missed poll is fine; the next one catches up.
      }
    }, 2000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [running, campaignId]);

  // When the drafts land, put them on the desk once.
  useEffect(() => {
    if (campaign?.status === "ready" && announced.current !== campaign.id) {
      announced.current = campaign.id;
      onDrafts(campaign.postIds);
    }
  }, [campaign, onDrafts]);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          brandId,
          goal,
          competitors: competitors.split(/\s+/).filter(Boolean),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { campaign?: Campaign; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "The campaign didn't start.");
      setNow(Date.now());
      setCampaign(payload.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The campaign didn't start.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <section aria-labelledby="campaign-title" className="panel mt-5 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="campaign-title" className="font-semibold">
          Campaign from a website
        </h2>
        <p className="eyebrow text-muted">Six agents · drafts only · you approve</p>
      </div>
      <form onSubmit={start} className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm" htmlFor="campaign-url">
          Company website
          <input
            id="campaign-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="example.com"
            className="field"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm" htmlFor="campaign-rivals">
            Competitor sites <span className="text-muted">(optional, up to 3)</span>
            <input
              id="campaign-rivals"
              type="text"
              value={competitors}
              onChange={(event) => setCompetitors(event.target.value)}
              placeholder="rival-one.com rival-two.com"
              className="field"
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="campaign-goal">
            Goal <span className="text-muted">(optional)</span>
            <input
              id="campaign-goal"
              type="text"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Beta sign-ups from engineering leads"
              className="field"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={starting || running || url.trim().length < 4} className="btn-primary disabled:opacity-50">
            {starting ? "Starting" : running ? "Agents working" : "Run the agents"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </form>

      {campaign ? (
        <div className="mt-5 border-t border-line pt-4" aria-live="polite">
          <p className="text-sm text-muted">
            {campaign.url} ·{" "}
            {campaign.status === "ready"
              ? `${campaign.postIds.length} drafts on the board`
              : campaign.status === "failed"
                ? "stopped"
                : "running"}
          </p>
          <ol className="mt-3 grid gap-2">
            {AGENT_ROSTER.map((agent, index) => {
              const step = campaign.steps.find((item) => item.agent === agent.id);
              const status: StepStatus = step?.status ?? "queued";
              return (
                <li key={agent.id} className="rounded-lg border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="eyebrow text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                    <span className="font-medium">{agent.label}</span>
                    <span className={`eyebrow inline-flex items-center rounded-full border px-2 py-0.5 ${STATUS_STYLE[status]}`}>
                      {status === "running" ? "working" : status}
                    </span>
                    {step ? <span className="eyebrow text-muted tabular-nums">{seconds(step, now)}</span> : null}
                    {step?.via ? <span className="eyebrow text-muted">{VIA_NAME[step.via] ?? step.via}</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{step?.error ? <span className="text-danger">{step.error}</span> : step?.note || agent.job}</p>
                  {step?.status === "done" && step.output ? <StepOutput agent={agent.id} output={step.output} /> : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="eyebrow text-muted">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function StepOutput({ agent, output }: { agent: string; output: unknown }) {
  if (agent === "research") {
    const research = output as Research;
    return (
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer">What it found</summary>
        <div className="mt-2 grid gap-3">
          <p>
            <strong>{research.product}</strong>: {research.oneLiner}
          </p>
          <Bullets title="Audience" items={research.audience} />
          <Bullets title="Pain points" items={research.painPoints} />
          <Bullets title="Proof on the site" items={research.proofOnSite.length ? research.proofOnSite : ["None found. The posts won't claim results."]} />
          {research.competitors.length ? (
            <div>
              <p className="eyebrow text-muted">Competitors</p>
              <ul className="mt-1 grid gap-1">
                {research.competitors.map((rival) => (
                  <li key={rival.name}>
                    <strong>{rival.name}</strong>{" "}
                    <span className={`eyebrow rounded-full border px-1.5 ${rival.source === "provided" ? "border-ink" : "border-line text-muted"}`}>
                      {rival.source === "provided" ? "page read" : "inferred, unchecked"}
                    </span>{" "}
                    {rival.angle}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Bullets title="Openings" items={research.gaps} />
        </div>
      </details>
    );
  }
  if (agent === "strategy") {
    const strategy = output as Strategy;
    return (
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer">The plan</summary>
        <div className="mt-2 grid gap-3">
          <p>{strategy.positioning}</p>
          <Bullets title="Pillars" items={strategy.pillars} />
          <Bullets
            title="Channels"
            items={strategy.channels.map((channel) => `${PLATFORM_NAME[channel.platform as Platform] ?? channel.platform}: ${channel.why} (${channel.cadence})`)}
          />
          <div>
            <p className="eyebrow text-muted">Seven days</p>
            <ol className="mt-1 grid gap-1">
              {strategy.days.map((day) => (
                <li key={day.day}>
                  <span className="tabular-nums text-muted">Day {day.day}</span> {day.theme}. <span className="text-muted">Ask: {day.cta}</span>
                </li>
              ))}
            </ol>
          </div>
          <Bullets title="Watch" items={strategy.kpis} />
        </div>
      </details>
    );
  }
  if (agent === "content") {
    const content = output as { posts: { id: string; platform: Platform; hook: string }[]; newsletter?: string };
    return (
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer">
          {content.posts.length} posts{content.newsletter ? " and a newsletter" : ""}
        </summary>
        <ul className="mt-2 grid gap-1">
          {content.posts.map((post) => (
            <li key={post.id}>
              <span className="eyebrow text-muted">{PLATFORM_NAME[post.platform]}</span> {post.hook}
            </li>
          ))}
        </ul>
        {content.newsletter ? (
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-sunken p-3 font-sans text-sm">{content.newsletter}</pre>
        ) : null}
      </details>
    );
  }
  return null;
}
