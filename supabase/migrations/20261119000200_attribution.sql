-- Revenue attribution and a leads CRM.
--
-- A board gets a public, write-only track key that the client's site uses with
-- /lp.js. The site reports landings that carry a LiftPage utm_campaign (lp-...), leads
-- (sign-ups, demo requests) and conversions (purchases). No visitor ids or IP addresses
-- are stored: the last LiftPage touch rides along in the visitor's own browser.

alter table public.brands add column if not exists track_key text unique;

create table public.leads (
  id text primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  email text not null check (length(email) between 3 and 320),
  name text not null default '' check (length(name) <= 200),
  company text not null default '' check (length(company) <= 200),
  -- The LiftPage touch that brought the lead in; empty when it came some other way.
  campaign text not null default '' check (length(campaign) <= 80),
  source text not null default '' check (length(source) <= 80),
  medium text not null default '' check (length(medium) <= 80),
  content text not null default '' check (length(content) <= 80),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  -- Deal value an operator entered, in minor units of the currency.
  value_cents bigint check (value_cents is null or value_cents between 0 and 100000000000),
  currency text not null default 'usd' check (length(currency) = 3),
  notes text not null default '' check (length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leads_brand_email on public.leads (brand_id, lower(email));
create index leads_brand_created on public.leads (brand_id, created_at desc);

create table public.attribution_events (
  id bigint generated always as identity primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  kind text not null check (kind in ('visit', 'lead', 'conversion')),
  campaign text not null default '' check (length(campaign) <= 80),
  source text not null default '' check (length(source) <= 80),
  medium text not null default '' check (length(medium) <= 80),
  content text not null default '' check (length(content) <= 80),
  path text not null default '' check (length(path) <= 300),
  value_cents bigint check (value_cents is null or value_cents between 0 and 100000000000),
  currency text check (currency is null or length(currency) = 3),
  -- The site's own order or sign-up id, so a resent event doesn't count twice.
  external_id text check (external_id is null or length(external_id) <= 120),
  lead_id text references public.leads (id) on delete set null,
  at timestamptz not null default now()
);
create unique index attribution_events_dedupe on public.attribution_events (brand_id, kind, external_id) where external_id is not null;
create index attribution_events_brand_campaign on public.attribution_events (brand_id, campaign, at desc);

-- Server-only, like every other table.
alter table public.leads enable row level security;
alter table public.attribution_events enable row level security;
