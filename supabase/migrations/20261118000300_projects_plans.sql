-- The client suite: what LiftPage builds and runs for each client, what they ask to change,
-- and the monthly plan that pays for it.

-- One row per thing we make or run for a client: their website, their social presence.
create table public.projects (
  id text primary key default ('prj_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  client_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('website', 'social')),
  name text not null check (length(name) between 1 and 120),
  -- The live address, for websites. Checked for uptime.
  url text check (url is null or url ~* '^https?://'),
  status text not null default 'building' check (status in ('building', 'review', 'live', 'paused')),
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Last uptime check, written by the hourly job or Check now.
  checked_at timestamptz,
  check_ok boolean,
  check_code int,
  check_ms int,
  check_error text
);
create index projects_client on public.projects (client_id, created_at);

-- A change the client asked for on one of their projects.
create table public.change_requests (
  id text primary key default ('chg_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  project_id text not null references public.projects (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  text text not null check (length(text) between 4 and 4000),
  status text not null default 'open' check (status in ('open', 'doing', 'done')),
  at timestamptz not null default now(),
  done_at timestamptz
);
create index change_requests_client on public.change_requests (client_id, at desc);
create index change_requests_open on public.change_requests (status) where status <> 'done';

-- The monthly plan. One per client.
--   offer 'trial':    first month free, then monthly. trial_ends_at is when billing starts.
--   offer 'locked':   monthly price held until locked_until, whatever the rate card says.
--   offer 'standard': monthly at the price shown.
create table public.plans (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default 'Online presence',
  monthly int not null check (monthly >= 0),
  includes text not null default '',
  offer text not null default 'standard' check (offer in ('trial', 'locked', 'standard')),
  trial_ends_at timestamptz,
  locked_until date,
  status text not null default 'pending' check (status in ('pending', 'trialing', 'active', 'past_due', 'canceled')),
  started_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  updated_at timestamptz not null default now(),
  constraint plans_trial_has_end check (offer <> 'trial' or trial_ends_at is not null),
  constraint plans_locked_has_end check (offer <> 'locked' or locked_until is not null)
);

-- Server only, like every other table: RLS on, no policies.
alter table public.projects enable row level security;
alter table public.change_requests enable row level security;
alter table public.plans enable row level security;
