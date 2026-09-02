create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'walker',
  avatar_url text,
  total_distance_km numeric(8, 2) not null default 0,
  total_walk_time_mins integer not null default 0,
  current_streak integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text not null default 'walker';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists total_distance_km numeric(8, 2) not null default 0;
alter table public.profiles add column if not exists total_walk_time_mins integer not null default 0;
alter table public.profiles add column if not exists current_streak integer not null default 0;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  district text not null,
  estimated_time_mins integer not null check (estimated_time_mins between 10 and 180),
  path_coordinates jsonb not null,
  checkpoints jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  total_distance_km numeric(8, 2) not null check (total_distance_km > 0),
  created_at timestamptz not null default now()
);

alter table public.routes add column if not exists district text not null default 'Tuen Mun';
alter table public.routes add column if not exists estimated_time_mins integer not null default 30;
alter table public.routes add column if not exists path_coordinates jsonb not null default '[]'::jsonb;
alter table public.routes add column if not exists checkpoints jsonb not null default '[]'::jsonb;
alter table public.routes add column if not exists is_public boolean not null default false;
alter table public.routes add column if not exists total_distance_km numeric(8, 2) not null default 1;
alter table public.routes add column if not exists created_at timestamptz not null default now();

create table if not exists public.walk_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  status text not null check (status in ('in_progress', 'paused', 'completed')),
  covered_coordinates jsonb not null default '[]'::jsonb,
  calories_burned numeric(8, 2) not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.walk_history add column if not exists status text not null default 'in_progress';
alter table public.walk_history add column if not exists covered_coordinates jsonb not null default '[]'::jsonb;
alter table public.walk_history add column if not exists calories_burned numeric(8, 2) not null default 0;
alter table public.walk_history add column if not exists started_at timestamptz not null default now();
alter table public.walk_history add column if not exists completed_at timestamptz;

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null default '',
  icon_emoji text not null default '🏅',
  threshold_distance_km numeric(8, 2) not null default 0,
  threshold_walks integer not null default 0,
  threshold_streak integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists idx_routes_user_id on public.routes(user_id);
create index if not exists idx_routes_public on public.routes(is_public);
create index if not exists idx_walk_history_user_id on public.walk_history(user_id);
create index if not exists idx_walk_history_route_id on public.walk_history(route_id);

insert into public.achievements (code, title, description, icon_emoji, threshold_distance_km, threshold_walks, threshold_streak)
values
  ('first_walk', '初次出門', '完成第一條路線', '🚶', 0, 1, 0),
  ('distance_10', '十公里探索者', '累積行走 10 公里', '📏', 10, 0, 0),
  ('distance_50', '五十公里探索者', '累積行走 50 公里', '🏞️', 50, 0, 0),
  ('streak_3', '三日連行', '連續 3 天完成散步', '🔥', 0, 0, 3),
  ('streak_7', '七日連行', '連續 7 天完成散步', '🌟', 0, 0, 7)
on conflict (code) do nothing;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(coalesce(new.email, 'walker'), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.walk_history enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

do
$$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Profiles are private to owner'
  ) then
    create policy "Profiles are private to owner"
      on public.profiles
      for all
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'routes' and policyname = 'Users manage own routes'
  ) then
    create policy "Users manage own routes"
      on public.routes
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'routes' and policyname = 'Public routes can be viewed'
  ) then
    create policy "Public routes can be viewed"
      on public.routes
      for select
      using (is_public = true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'walk_history' and policyname = 'Walk history is private to owner'
  ) then
    create policy "Walk history is private to owner"
      on public.walk_history
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'achievements' and policyname = 'Achievements are readable'
  ) then
    create policy "Achievements are readable"
      on public.achievements
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_achievements' and policyname = 'User achievements are private'
  ) then
    create policy "User achievements are private"
      on public.user_achievements
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end;
$$;
