-- Messages between a client and LiftPage. One thread per client account: client_id is the
-- thread, whoever wrote the message. read_at is set when the other side opens the thread
-- (an admin for a client's message, the client for LiftPage's).
create table public.messages (
  id text primary key default ('msg_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  client_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  role text not null check (role in ('admin', 'client')),
  text text not null check (length(text) between 1 and 4000),
  at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_thread on public.messages (client_id, at);
-- The admin inbox asks "which clients wrote something nobody has read".
create index messages_unread on public.messages (client_id) where read_at is null and role = 'client';

-- Server only, like every other table: RLS on, no policies.
alter table public.messages enable row level security;
