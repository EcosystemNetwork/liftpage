-- Admin content studio: long-form pieces written with the AI writer, kept per board so they
-- can be reopened, edited, and handed off. Server-only like every other table: RLS on, no
-- policies, only the secret key reads or writes.
create table public.content_drafts (
  id text primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  format text not null,
  title text not null default '',
  brief text not null default '',
  body text not null,
  -- Which backend wrote it: harnessrouter or tokenrouter, and the harness and model when known.
  via text not null default '',
  harness text not null default '',
  model text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_drafts_brand_at on public.content_drafts (brand_id, updated_at desc);
create index content_drafts_at on public.content_drafts (updated_at desc);
create index content_drafts_created_by on public.content_drafts (created_by);

alter table public.content_drafts enable row level security;
