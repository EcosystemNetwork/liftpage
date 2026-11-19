# LiftPage Growth OS: engineering plan

Status: plan, 2026-11-18. Demo day 2026-11-20.

The pitch: one URL in, a reviewed week-long campaign out, every step visible. Six agents, one approval desk, and the numbers it can actually measure.

## 1. What already exists (build on it, don't rebuild)

| Growth OS piece | Already in the repo | Gap |
|---|---|---|
| Model routing | `lib/ai.ts` `complete()`: HarnessRouter first, TokenRouter fallback | One harness/model for everything; no per-agent routing, no usage/cost returned |
| Content agent | `lib/cut.ts` `cutWeek()` (8 posts), `lib/write.ts` `writePiece()` (newsletter, launch page, outreach, ads, clip plan…) | Driven by a hand-written brief, not by research/strategy |
| Approval gate | `posts.status` draft → approved → cued, client review notes, `/desk` | None: campaign output should land here as drafts |
| Distribution | `lib/social/publish.ts`, Inngest `publish-at-slot` | Fine for demo |
| Analytics | `metrics` table (followers, impressions, engagements, clicks, leads), `insights-sync`, weekly reports | No per-post/per-campaign attribution, no "what next" step |
| Run log | `runs` table (brief, via, post_ids) | One row per cut; no per-step trace, status, or cost |

Conclusion: the new parts are (a) reading a website, (b) a research + strategy step, (c) a per-step agent trace with live status, and (d) a command-center view. Everything downstream already works.

## 2. Architecture

```
/desk  "New campaign from URL"  ──POST /api/campaign──►  campaigns row (status=queued)
   ▲                                                         │
   │ polls GET /api/campaign/[id] every 2s                    ▼
   │                                   Inngest "liftpage/campaign.requested"
   │                                   (inline fallback when Inngest keys are absent)
   │                                         │ step.run per agent → agent_steps row
   │      ┌──────────────┬──────────────┬────┴─────────┬──────────────┬──────────────┐
   │   Research       Strategy       Content        Distribution    Community      Analyst
   │   site + comps   positioning,   cutWeek +      slot plan,      outreach       baseline +
   │                  7-day plan     writePiece     UTM links       targets+drafts  next tests
   │      └──────────────┴──────┬───────┴──────────────┴──────────────┴──────────────┘
   │                            ▼
   └──── posts (status=draft) + campaign artifacts ──► existing approve → cue → publish
```

Rules carried over from the current product: nothing publishes, messages anyone, or spends money without a human approving it on the desk. Agents only produce drafts.

### New files

| File | Purpose |
|---|---|
| `lib/read-site.ts` (`lib/site.ts` is taken: it's the public origin helper) | Fetch a URL server-side, strip to text + title/meta/OG, cap ~20 KB. **SSRF guard**: http(s) only, resolve DNS and reject private/loopback/link-local ranges, no redirects to them, 10 s timeout, 2 MB cap. |
| `lib/agents/types.ts` | `Agent<I, O> = { id, label, harness?, model?, system, build(input): string, parse(text): O \| null, fallback?(input): O }` |
| `lib/agents/{research,strategy,content,distribution,community,analyst}.ts` | One agent each (prompts in §4) |
| `lib/agents/run.ts` | `runCampaign(campaignId)`: runs agents in order, writes an `agent_steps` row before/after each, passes outputs forward, stops cleanly on failure with the error on the step |
| `app/api/campaign/route.ts` | POST `{ url, brandId, goal? }` → creates campaign, sends Inngest event (or runs inline under `maxDuration`) |
| `app/api/campaign/[id]/route.ts` | GET campaign + steps for polling |
| `components/CampaignCommand.tsx` | URL box, six-agent rail (queued / running / done / failed, duration, via, cost), expandable output per agent, "Open drafts" button |
| `supabase/migrations/20261118000600_campaigns.sql` | Tables below |

### Changes to existing code (impact analysis required first, per CLAUDE.md)

- `lib/ai.ts` `complete()`: add optional `harness` / `model` overrides and return `usage` (input/output tokens) when the backend reports it. Callers: `cut.ts`, `write.ts`, and others; keep the return shape backward compatible (add fields, don't rename).
- `lib/cut.ts` `cutWeek()`: accept an optional strategy context string appended to the prompt. Don't touch `localCut`.
- `lib/inngest/functions.ts`: add `campaignRun` with `step.run` per agent (gets durable retries per step for free).
- `lib/types.ts`: `Campaign`, `AgentStep`.

### Schema

```sql
create table public.campaigns (
  id text primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  url text not null,
  goal text not null default '',
  status text not null default 'queued',   -- queued|running|ready|failed
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  memory jsonb not null default '{}'::jsonb, -- product, audience, positioning: reused by the next campaign
  post_ids text[] not null default '{}',
  cost_usd numeric(10,4) not null default 0
);
create table public.agent_steps (
  id text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  agent text not null,                       -- research|strategy|content|distribution|community|analyst
  status text not null default 'queued',     -- queued|running|done|failed|skipped
  started_at timestamptz, finished_at timestamptz,
  via text, model text,
  tokens_in int, tokens_out int, cost_usd numeric(10,4),
  output jsonb, error text
);
create index agent_steps_campaign on public.agent_steps (campaign_id);
alter table public.campaigns enable row level security;
alter table public.agent_steps enable row level security;
-- No policies: server-only access through lib/dal.ts, same as every other table.
```

## 3. Prioritized backlog

Estimates assume one developer who knows the codebase.

### Day 1: 11/18, the signature workflow (must ship)

| # | Task | Est |
|---|---|---|
| 0 | Commit the current uncommitted client self-serve work first, so the Growth OS work is a clean diff | 15m |
| 1 | Migration + `Campaign`/`AgentStep` types + store functions | 45m |
| 2 | `read-site` with SSRF guard + tests (private IP, redirect, size cap) | 1h |
| 3 | Agent type + runner + `agent_steps` writes; inline execution first | 1.5h |
| 4 | Research + Strategy agents (JSON out, strict parse, one retry) | 1.5h |
| 5 | Content agent = `cutWeek(brief-from-strategy)` + `writePiece("newsletter")` → posts as drafts | 1h |
| 6 | `/api/campaign` POST + GET | 45m |
| 7 | `CampaignCommand` on `/desk`: URL in, six-agent rail, polling, outputs | 2h |

At the end of day 1 a URL produces a reviewable campaign on the desk with a visible trace. Distribution, Community, and Analyst can show as "skipped" if time runs out; that is still a full demo.

### Day 2: 11/19, make it real

| # | Task | Est |
|---|---|---|
| 8 | Distribution agent: slot plan + UTM on every post link (`utm_source=<platform>&utm_campaign=<campaignId>&utm_content=<postId>`) | 1h |
| 9 | Community agent: target communities/creator *types* + 3 outreach drafts via `writePiece("outreach")`; drafts only | 1h |
| 10 | Analyst agent: reads existing `metrics` for the brand → baseline + 3 experiments for next week | 1h |
| 11 | Move runner into Inngest `step.run` (durable, per-step retries) | 45m |
| 12 | Usage → cost per step and per campaign; show the total on the rail | 45m |
| 13 | Campaign memory: save Research/Strategy output, reuse on the next run for that brand | 30m |
| 14 | Run it on 2–3 real companies; publish at least one approved post to X; screen-record | rest of day |

### After demo day

Competitor dashboard with real data (needs a search/scrape provider), per-post insights to compute winners, A/B variants on the hook, lead → customer attribution through Stripe customer metadata, quality scoring before drafts reach the desk, publishing-failure retry/recovery UI, and pricing tiers.

## 4. Agent definitions

Every agent returns JSON only, parsed strictly; unparseable output counts as a failed attempt (one retry, then the step fails with the raw text kept in `error` for debugging). Shared rule appended to every system prompt:

> Never invent numbers, customers, quotes, prices, results, or names. If something is not in the input, say "unknown" or use a [BRACKETED PLACEHOLDER]. Mark anything inferred rather than read as `"inferred": true`.

| Agent | Input | Output (JSON) | Routing |
|---|---|---|---|
| **Research** | site text, title, meta, optional competitor URLs (also fetched) | `{ product, oneLiner, audience[], painPoints[], valueProps[], proofOnSite[], competitors[{name, url?, angle, source: "provided"\|"inferred"}], gaps[] }` | strongest model; long context |
| **Strategy** | Research output, goal, brand voice/networks | `{ positioning, messagingPillars[3], channelPlan[{platform, why, cadence}], sevenDays[{day, theme, objective, cta}], kpis[] }` | strongest model |
| **Content** | Strategy + brand | posts via `cutWeek` (existing schema), plus newsletter + 3 short-video scripts via `writePiece` | cheaper/faster model is fine |
| **Distribution** | posts, connected networks | `{ schedule[{postId, slot}], links[{postId, url}] }`; mostly deterministic code, model only for slot reasoning | cheap model or none |
| **Community** | Research + Strategy | `{ communities[{name, where, why}], creatorProfiles[{type, why}], outreach[{target, message}] }`; profiles are *types* to look for, not named people unless provided | mid model |
| **Growth Analyst** | brand metrics (existing table), previous campaign memory | `{ baseline, winners[], losers[], experiments[{hypothesis, change, metric}] }`; with no data says so and proposes a measurement plan | mid model |

The routing column is the HarnessRouter story for judges: each agent declares the harness/model it needs and `complete()` sends it there, with TokenRouter as fallback. Show `via` + model per step on the rail.

## 5. Honest constraints to design around

- **Competitor research needs the web.** Unless the HarnessRouter harness has a browsing/search tool, the model is guessing competitors from training data. Let the user paste competitor URLs (fetched like the main site), and label anything else `source: "inferred"` in the UI. Don't show inferred competitors as facts.
- **Latency.** Each call has a 90–100 s timeout and the agents run in sequence. Target under 3 minutes total: run Content's newsletter/scripts in parallel with `cutWeek`, and keep Research input capped.
- **Demo-day metrics will be thin.** One day of posting gives impressions, maybe clicks. Show the attribution wiring (UTM → clicks → leads field) and the real small numbers; don't extrapolate.
- **Network approval.** X is the realistic live-publish target; TikTok/YouTube post privately until their apps are audited (README).
- **Pricing.** The proposed $99–$1,499 tiers conflict with the existing `PACKAGES` and `plans`. Leave pricing alone for the demo and present tiers as a slide only.

## 6. Demo script (3 minutes)

1. Paste a real startup's URL (with permission) on `/desk` → New campaign.
2. The rail lights up agent by agent; open Research and Strategy outputs as they land.
3. Open the drafts: approve two, cue one to X, Publish now.
4. Show the cost per campaign and the trace (which harness/model ran each step).
5. Show the client's view on `/account`, then the Analyst's next-week experiments.
