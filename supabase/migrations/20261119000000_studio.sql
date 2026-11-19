-- Content studio: a person's requests to the LiftPage content agent (a HarnessRouter Harness)
-- and their follow-ups. One row per task. Ids from HarnessRouter (response, session) are kept
-- so the task can be polled, continued and its files fetched; they never reach the browser.
create table public.studio_tasks (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  harness_id text not null,
  -- The first task's id. Follow-ups share it and continue the same HarnessRouter session.
  thread_id text not null,
  parent_id text references public.studio_tasks (id) on delete set null,
  idempotency_key uuid not null,
  input text not null check (length(input) between 1 and 20000),
  attachments jsonb not null default '[]',
  status text not null check (status in ('starting', 'in_progress', 'completed', 'incomplete', 'failed', 'cancelled')),
  response_id text,
  session_id text,
  answer text,
  files jsonb not null default '[]',
  incomplete_reason text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index studio_tasks_user_thread on public.studio_tasks (user_id, thread_id, created_at);
create index studio_tasks_user_recent on public.studio_tasks (user_id, created_at desc);

-- Server only, like every other table: RLS on, no policies.
alter table public.studio_tasks enable row level security;
