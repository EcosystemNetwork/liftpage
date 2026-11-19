-- Stripe. The money lands on holds (stripe_session_id, amount_paid, paid_at in the first
-- migration). This table only remembers which webhook events were handled, so a retried
-- delivery is answered 200 without doing the work twice.
create table public.stripe_events (
  id text primary key,
  type text not null,
  hold_id text references public.holds (id) on delete set null,
  received_at timestamptz not null default now()
);

-- Server only, like every other table: RLS on, no policies.
alter table public.stripe_events enable row level security;
