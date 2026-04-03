create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null references public.users(id) on delete cascade,
  guest_user_id uuid references public.users(id) on delete set null,
  host_deck_id text,
  guest_deck_id text,
  first_player text check (first_player in ('P1', 'P2')),
  status text not null default 'waiting' check (status in ('waiting', 'ready', 'in_progress', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  turn integer not null default 1,
  phase text not null,
  state_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_sessions_expires_at on public.sessions(expires_at);
create index if not exists idx_games_host_user_id on public.games(host_user_id);
create index if not exists idx_games_guest_user_id on public.games(guest_user_id);
create index if not exists idx_game_state_snapshots_game_id on public.game_state_snapshots(game_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_games_updated_at on public.games;
create trigger trg_games_updated_at
before update on public.games
for each row execute function public.set_updated_at();
