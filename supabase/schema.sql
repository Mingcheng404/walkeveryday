-- WalkEveryDay schema v2 (idempotent)
create extension if not exists pgcrypto;

-- ============ profiles ============
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

-- ============ routes ============
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  district text not null default 'Custom',
  route_name text,
  estimated_time_mins integer not null default 30,
  path_coordinates jsonb not null default '[]'::jsonb,
  checkpoints jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  route_source text not null default 'generated' check (route_source in ('generated','recorded')),
  total_distance_km numeric(8, 2) not null default 1,
  created_at timestamptz not null default now()
);

alter table public.routes add column if not exists district text not null default 'Custom';
alter table public.routes add column if not exists route_name text;
alter table public.routes add column if not exists estimated_time_mins integer not null default 30;
alter table public.routes add column if not exists path_coordinates jsonb not null default '[]'::jsonb;
alter table public.routes add column if not exists checkpoints jsonb not null default '[]'::jsonb;
alter table public.routes add column if not exists is_public boolean not null default false;
alter table public.routes add column if not exists route_source text not null default 'generated';
alter table public.routes add column if not exists total_distance_km numeric(8, 2) not null default 1;
alter table public.routes add column if not exists created_at timestamptz not null default now();
-- relax the old check constraint if it exists (estimated_time_mins between 10 and 180)
do $$ begin
  alter table public.routes drop constraint if exists routes_estimated_time_mins_check;
exception when others then null; end $$;
do $$ begin
  alter table public.routes drop constraint if exists routes_total_distance_km_check;
exception when others then null; end $$;

-- ============ walk_history ============
create table if not exists public.walk_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress','paused','completed')),
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

-- ============ achievements ============
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

-- Ensure all columns exist even if table was created by older schema
alter table public.achievements add column if not exists code text;
alter table public.achievements add column if not exists title text;
alter table public.achievements add column if not exists description text not null default '';
alter table public.achievements add column if not exists icon_emoji text not null default '🏅';
alter table public.achievements add column if not exists threshold_distance_km numeric(8, 2) not null default 0;
alter table public.achievements add column if not exists threshold_walks integer not null default 0;
alter table public.achievements add column if not exists threshold_streak integer not null default 0;
alter table public.achievements add column if not exists created_at timestamptz not null default now();
-- Fix nullable columns from old schema
alter table public.achievements alter column code set not null;
alter table public.achievements alter column title set not null;
-- Handle old schema that used "name" instead of "title"
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'achievements' and column_name = 'name' and table_schema = 'public') then
    -- Copy old name data to title if title is empty
    update public.achievements set title = name where title is null or title = '';
    -- Drop the old name column
    alter table public.achievements drop column name;
  end if;
end; $$;
-- Add unique constraint on code if missing
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'achievements_code_key') then
    alter table public.achievements add constraint achievements_code_key unique (code);
  end if;
end; $$;

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

-- ============ habit_settings ============
create table if not exists public.habit_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_target_days integer not null default 7 check (weekly_target_days between 1 and 7),
  daily_target_km numeric(6,2) not null default 2 check (daily_target_km > 0),
  vacation_mode boolean not null default false,
  reminder_enabled boolean not null default false,
  reminder_hour integer not null default 20 check (reminder_hour between 0 and 23),
  updated_at timestamptz not null default now()
);

-- ============ indexes ============
create index if not exists idx_routes_user_id on public.routes(user_id);
create index if not exists idx_routes_public on public.routes(is_public);
create index if not exists idx_walk_history_user_id on public.walk_history(user_id);
create index if not exists idx_walk_history_route_id on public.walk_history(route_id);

-- ============ seed achievements ============
insert into public.achievements (code, title, description, icon_emoji, threshold_distance_km, threshold_walks, threshold_streak)
values
  ('first_walk', '初次出門', '完成第一條路線', '🚶', 0, 1, 0),
  ('distance_10', '十公里探索者', '累積行走 10 公里', '📏', 10, 0, 0),
  ('distance_50', '五十公里探索者', '累積行走 50 公里', '🏞️', 50, 0, 0),
  ('streak_3', '三日連行', '連續 3 天完成散步', '🔥', 0, 0, 3),
  ('streak_7', '七日連行', '連續 7 天完成散步', '🌟', 0, 0, 7)
on conflict (code) do nothing;

-- ============ auto profile on signup ============
create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(coalesce(new.email,'walker'),'@',1))
  on conflict (id) do nothing;
  insert into public.habit_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row execute procedure public.handle_new_user_profile();

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.walk_history enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.habit_settings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Profiles owner') then
    create policy "Profiles owner" on public.profiles for all using (auth.uid()=id) with check (auth.uid()=id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='routes' and policyname='Routes owner') then
    create policy "Routes owner" on public.routes for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='routes' and policyname='Public routes read') then
    create policy "Public routes read" on public.routes for select using (is_public=true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='walk_history' and policyname='Walk owner') then
    create policy "Walk owner" on public.walk_history for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='achievements' and policyname='Achievements read') then
    create policy "Achievements read" on public.achievements for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_achievements' and policyname='UA owner') then
    create policy "UA owner" on public.user_achievements for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='habit_settings' and policyname='Habit owner') then
    create policy "Habit owner" on public.habit_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
end; $$;
