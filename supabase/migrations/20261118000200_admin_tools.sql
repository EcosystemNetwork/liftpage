-- Admin is the owner's alone. Any other admin row becomes a client, and the database refuses
-- to make another. Kept in step with OWNER_EMAILS in lib/owner.ts; change both together.
update public.profiles set role = 'client' where role = 'admin' and email <> 'ericnans@gmail.com';
alter table public.profiles
  add constraint profiles_admin_is_owner check (role <> 'admin' or email = 'ericnans@gmail.com');

-- Where each client is in the relationship. Drives the overview's filters and health flags.
alter table public.profiles
  add column stage text not null default 'onboarding'
    check (stage in ('onboarding', 'active', 'paused', 'churned'));

-- Private notes on a client. Never shown to the client.
create table public.client_notes (
  id text primary key default ('cn_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  client_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  text text not null check (length(text) between 1 and 4000),
  pinned boolean not null default false,
  at timestamptz not null default now()
);
create index client_notes_client on public.client_notes (client_id, pinned desc, at desc);

-- Every admin action that changes something, so there is a record of what was done for whom.
create table public.admin_events (
  id text primary key default ('ae_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text not null default '',
  action text not null,
  client_id uuid references public.profiles (id) on delete set null,
  detail text not null default ''
);
create index admin_events_at on public.admin_events (at desc);
create index admin_events_client on public.admin_events (client_id, at desc);

-- Server only, like every other table: RLS on, no policies.
alter table public.client_notes enable row level security;
alter table public.admin_events enable row level security;
