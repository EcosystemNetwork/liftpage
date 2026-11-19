-- Creative Studio: a brand kit per board, and the carousels and short-form video scripts
-- made with it. Slides are drawn from the kit at view time, so only the words are stored.
alter table public.brands add column if not exists kit jsonb;

create table public.creatives (
  id text primary key,
  brand_id text not null references public.brands (id) on delete cascade,
  kind text not null check (kind in ('carousel', 'video')),
  title text not null default '' check (length(title) <= 200),
  brief text not null default '' check (length(brief) <= 4000),
  data jsonb not null,
  via text not null default '',
  usage jsonb,
  created_at timestamptz not null default now()
);
create index creatives_brand_created on public.creatives (brand_id, created_at desc);

alter table public.creatives enable row level security;
