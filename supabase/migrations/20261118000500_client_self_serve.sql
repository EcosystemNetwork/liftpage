-- What a client can do from their own account: start a campaign with a brief, hand over
-- photos, ask for a change that isn't tied to one project, and tell us about their social
-- accounts (or ask us to make them).

-- A campaign started from the account says what it's for.
alter table public.holds add column if not exists brief text not null default '';

-- "Anything else" requests belong to the client, not to a project.
alter table public.change_requests alter column project_id drop not null;

-- Photos a client uploads for LiftPage to use. Private: read through short-lived signed URLs.
create table public.client_photos (
  id text primary key default ('pho_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  client_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  path text not null unique,
  type text not null,
  size int not null check (size > 0),
  caption text not null default '' check (length(caption) <= 500),
  at timestamptz not null default now()
);
create index client_photos_client on public.client_photos (client_id, at desc);

-- One row per network: the client has an account (handle), wants us to make one, or skips it.
create table public.social_setup (
  client_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok', 'x', 'linkedin', 'youtube', 'google')),
  ask text not null check (ask in ('have', 'make', 'skip')),
  handle text not null default '' check (length(handle) <= 200),
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'done')),
  updated_at timestamptz not null default now(),
  primary key (client_id, platform)
);

-- Server only, like every other table: RLS on, no policies.
alter table public.client_photos enable row level security;
alter table public.social_setup enable row level security;

-- Client photos: private, images only, 25 MB each. Uploads go through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-photos', 'client-photos', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;
