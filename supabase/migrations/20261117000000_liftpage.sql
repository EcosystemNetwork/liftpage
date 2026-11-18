-- LiftPage schema. Every table has RLS on and no policies: only the server, holding the
-- secret (service role) key, reads or writes. The browser never talks to these tables.

-- People. One row per auth.users row, made by the trigger below.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  company text not null default '',
  role text not null default 'client' check (role in ('admin', 'client')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Role is never read from user metadata: sign-up lets anyone set that. Everyone starts as a
-- client; admins are promoted by the server.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name, company)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'company', ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email();

create table public.brands (
  id text primary key,
  -- The client this board is for. Null is LiftPage's own house board.
  client_id uuid references public.profiles (id) on delete set null,
  name text not null,
  handle text not null default '',
  voice text not null default '',
  offers text not null default '',
  platforms text[] not null default '{}',
  created_at timestamptz not null default now()
);
-- One board per client.
create unique index brands_one_per_client on public.brands (client_id) where client_id is not null;

create table public.posts (
  id text primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  platform text not null check (platform in ('x', 'instagram', 'tiktok', 'linkedin', 'youtube')),
  slot timestamptz not null,
  hook text not null default '',
  caption text not null default '',
  visual text not null default '',
  reply text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'cued')),
  media_path text,
  media_type text,
  -- Publishing. cue_id changes on every cue, so a job that slept through a re-cue stands down.
  cue_id text,
  publish_state text not null default 'idle'
    check (publish_state in ('idle', 'scheduled', 'publishing', 'published', 'failed')),
  publish_error text,
  published_url text,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create index posts_brand_slot on public.posts (brand_id, slot);

-- Client review on a post: approve, ask for changes, or just comment.
create table public.post_notes (
  id text primary key default ('note_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
  post_id text not null references public.posts (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  role text not null check (role in ('admin', 'client')),
  kind text not null check (kind in ('approved', 'changes', 'comment')),
  text text not null default '',
  at timestamptz not null default now()
);
create index post_notes_post on public.post_notes (post_id, at);

create table public.runs (
  id text primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  at timestamptz not null default now(),
  brief text not null,
  via text not null,
  note text not null default '',
  post_ids text[] not null default '{}'
);
create index runs_brand_at on public.runs (brand_id, at desc);

create table public.holds (
  id text primary key,
  at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text not null,
  package_id text not null check (package_id in ('starter', 'growth', 'accelerator', 'event')),
  brand_id text references public.brands (id) on delete set null,
  amount integer not null,
  status text not null default 'requested' check (status in ('requested', 'contacted', 'won', 'lost')),
  user_id uuid references public.profiles (id) on delete set null,
  note text,
  stripe_session_id text unique,
  amount_paid integer,
  paid_at timestamptz
);
create index holds_at on public.holds (at desc);
create index holds_email on public.holds (email);
create index holds_user on public.holds (user_id);

create table public.metrics (
  id text primary key default ('met_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week date not null,
  platform text not null check (platform in ('x', 'instagram', 'tiktok', 'linkedin', 'youtube')),
  followers bigint not null default 0,
  impressions bigint not null default 0,
  engagements bigint not null default 0,
  clicks bigint not null default 0,
  leads bigint not null default 0,
  at timestamptz not null default now(),
  -- A user id, or "sync:<platform>" for numbers pulled from a network.
  by text not null default '',
  source text not null default 'manual' check (source in ('manual', 'csv', 'sync')),
  unique (user_id, week, platform)
);

-- Connected network accounts. Tokens are AES-GCM sealed by the app before they land here.
create table public.social_accounts (
  brand_id text not null references public.brands (id) on delete cascade,
  platform text not null check (platform in ('x', 'instagram', 'tiktok', 'linkedin', 'youtube')),
  account_id text not null,
  account_name text not null default '',
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  connected_at timestamptz not null default now(),
  connected_by uuid references public.profiles (id) on delete set null,
  primary key (brand_id, platform)
);

-- Shared rate limiter, so limits hold across server instances.
create table public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

create function public.hit_rate_limit(p_key text, p_max integer, p_window_ms integer) returns boolean
language plpgsql set search_path = '' as $$
declare
  hits integer;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    count = case when r.reset_at < now() then 1 else r.count + 1 end,
    reset_at = case when r.reset_at < now() then excluded.reset_at else r.reset_at end
  returning count into hits;
  return hits > p_max;
end $$;

alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.posts enable row level security;
alter table public.post_notes enable row level security;
alter table public.runs enable row level security;
alter table public.holds enable row level security;
alter table public.metrics enable row level security;
alter table public.social_accounts enable row level security;
alter table public.rate_limits enable row level security;

-- Functions in public are callable over the API by default. These are server-only.
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email() from public, anon, authenticated;

-- Post media. Public read, because Instagram and the other networks fetch media by URL.
-- Uploads go through signed URLs the server hands out; there are no client write policies.
insert into storage.buckets (id, name, public, file_size_limit)
values ('post-media', 'post-media', true, 524288000)
on conflict (id) do nothing;
