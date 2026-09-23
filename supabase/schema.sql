create table if not exists public.friday_memory (
  user_id text primary key,
  memory jsonb not null default '{"user":{"preferredName":null},"facts":[],"preferences":{}}'::jsonb,
  updated_at timestamptz not null default now()
);
