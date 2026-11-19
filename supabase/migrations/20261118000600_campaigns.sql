-- Growth OS: a campaign started from a website URL, and one row per agent step so the desk
-- can show each agent's status, which backend ran it, and what it produced.

create table public.campaigns (
  id text primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  url text not null check (length(url) <= 2000),
  goal text not null default '' check (length(goal) <= 500),
  competitors text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Research and strategy, kept so the next campaign for this brand can start from them.
  memory jsonb not null default '{}'::jsonb,
  post_ids text[] not null default '{}'
);
create index campaigns_brand on public.campaigns (brand_id, created_at desc);

create table public.agent_steps (
  campaign_id text not null references public.campaigns (id) on delete cascade,
  agent text not null check (agent in ('research', 'strategy', 'content', 'distribution', 'community', 'analyst')),
  position int not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  started_at timestamptz,
  finished_at timestamptz,
  via text,
  note text not null default '',
  output jsonb,
  error text,
  primary key (campaign_id, agent)
);

-- Server-only, like every other table: RLS on, no policies, reached through lib/dal.ts checks.
alter table public.campaigns enable row level security;
alter table public.agent_steps enable row level security;
