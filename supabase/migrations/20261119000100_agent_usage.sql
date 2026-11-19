-- Model spend per agent step: calls, tokens, models, and dollars where a price is set
-- (LIFTPAGE_AI_PRICES). A campaign's cost is the sum of its steps. Apply before deploying
-- the code that writes it.
alter table public.agent_steps add column if not exists usage jsonb;
