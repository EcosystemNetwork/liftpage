-- The AI tools an admin has switched on for a client. Admins always have every tool.
-- Ids: 'week', 'redraft', and the writer formats in lib/formats.ts.
alter table public.profiles add column if not exists tools text[] not null default '{}';
