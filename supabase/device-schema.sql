-- Friday device registry
-- RLS is enabled so device records are not publicly readable/writable.

create table if not exists public.friday_devices (
  device_id uuid primary key,
  user_id text not null,
  device_name text not null,
  platform text not null,
  architecture text not null,
  agent_version text not null,
  token_hash text not null,
  online boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.friday_devices enable row level security;

-- The service role used by the Friday backend bypasses RLS.
-- No public/anonymous policies are created.
