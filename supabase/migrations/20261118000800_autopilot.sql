-- Content autopilot: per client, a weekly run that writes next week's posts as drafts.
-- Nothing here publishes; drafts still go through client or admin approval.
create table public.autopilot (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  -- Day of the week it runs, in Pacific time. 0 = Sunday.
  weekday smallint not null default 0 check (weekday between 0 and 6),
  -- Standing instructions from the admin: tone, topics to push or avoid, this month's promos.
  guidance text not null default '' check (length(guidance) <= 2000),
  -- Email the client when the drafts land.
  notify boolean not null default true,
  last_run_at timestamptz,
  last_result text not null default '',
  updated_at timestamptz not null default now()
);
create index autopilot_enabled on public.autopilot (enabled) where enabled;

-- Server only, like every other table: RLS on, no policies.
alter table public.autopilot enable row level security;
