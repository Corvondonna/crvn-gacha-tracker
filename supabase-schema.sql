-- Supabase schema for crvn-gacha-tracker
-- Run this in Supabase SQL Editor (Database > SQL Editor)

-- ============================================================
-- TABLES
-- ============================================================

create table public.resources (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  game_id text not null,
  updated_at text not null,
  currency integer not null default 0,
  pull_items integer not null default 0,
  weapon_pull_items integer not null default 0,
  paid_currency integer not null default 0,
  current_pity integer not null default 0,
  is_guaranteed boolean not null default false,
  weapon_current_pity integer not null default 0,
  weapon_is_guaranteed boolean not null default false,
  weapon_fate_points integer not null default 0,
  monthly_pass_active boolean not null default false,
  monthly_pass_expiry text,
  daily_commissions_active boolean not null default false,
  secondary_pull_items integer not null default 0,
  char_spark_count integer not null default 0,
  support_spark_count integer not null default 0
);

create table public.timeline (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  game_id text not null,
  version text not null,
  phase smallint not null,
  start_date text not null,
  character_name text,
  character_portrait_url text,
  value_tier text not null default 'limited',
  is_speculation boolean not null default false,
  is_priority boolean not null default false,
  pull_status text not null default 'none',
  pulling_weapon boolean not null default false,
  banner_lane text,
  banner_duration_days integer,
  rate_up_percent real,
  spark_count integer,
  dupe_count integer
);

create table public.pulls (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  game_id text not null,
  banner_type text not null,
  item_id text not null,
  item_name text not null,
  rarity integer not null,
  pity integer not null,
  timestamp text not null,
  is_rate_up boolean,
  raw_data jsonb not null default '{}'
);

create table public.characters (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  game_id text not null,
  display_name text not null,
  internal_id text,
  portrait_url text,
  release_version text,
  release_phase smallint,
  release_date text,
  value_tier text not null default 'limited'
);

create table public.combat_claims (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  mode_id text not null,
  reset_date text not null,
  amount integer not null,
  claimed_at text not null
);

create table public.event_claims (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  event_key text not null,
  game_id text not null,
  event_type text not null,
  version text not null,
  amount integer not null,
  claimed_at text not null
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.resources enable row level security;
alter table public.timeline enable row level security;
alter table public.pulls enable row level security;
alter table public.characters enable row level security;
alter table public.combat_claims enable row level security;
alter table public.event_claims enable row level security;

-- Policy: users can only access their own rows
create policy "Users can view own resources" on public.resources for select using (auth.uid() = user_id);
create policy "Users can insert own resources" on public.resources for insert with check (auth.uid() = user_id);
create policy "Users can update own resources" on public.resources for update using (auth.uid() = user_id);
create policy "Users can delete own resources" on public.resources for delete using (auth.uid() = user_id);

create policy "Users can view own timeline" on public.timeline for select using (auth.uid() = user_id);
create policy "Users can insert own timeline" on public.timeline for insert with check (auth.uid() = user_id);
create policy "Users can update own timeline" on public.timeline for update using (auth.uid() = user_id);
create policy "Users can delete own timeline" on public.timeline for delete using (auth.uid() = user_id);

create policy "Users can view own pulls" on public.pulls for select using (auth.uid() = user_id);
create policy "Users can insert own pulls" on public.pulls for insert with check (auth.uid() = user_id);
create policy "Users can update own pulls" on public.pulls for update using (auth.uid() = user_id);
create policy "Users can delete own pulls" on public.pulls for delete using (auth.uid() = user_id);

create policy "Users can view own characters" on public.characters for select using (auth.uid() = user_id);
create policy "Users can insert own characters" on public.characters for insert with check (auth.uid() = user_id);
create policy "Users can update own characters" on public.characters for update using (auth.uid() = user_id);
create policy "Users can delete own characters" on public.characters for delete using (auth.uid() = user_id);

create policy "Users can view own combat_claims" on public.combat_claims for select using (auth.uid() = user_id);
create policy "Users can insert own combat_claims" on public.combat_claims for insert with check (auth.uid() = user_id);
create policy "Users can update own combat_claims" on public.combat_claims for update using (auth.uid() = user_id);
create policy "Users can delete own combat_claims" on public.combat_claims for delete using (auth.uid() = user_id);

create policy "Users can view own event_claims" on public.event_claims for select using (auth.uid() = user_id);
create policy "Users can insert own event_claims" on public.event_claims for insert with check (auth.uid() = user_id);
create policy "Users can update own event_claims" on public.event_claims for update using (auth.uid() = user_id);
create policy "Users can delete own event_claims" on public.event_claims for delete using (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKET (for character portraits)
-- ============================================================

insert into storage.buckets (id, name, public) values ('portraits', 'portraits', true);

create policy "Users can upload portraits" on storage.objects for insert with check (
  bucket_id = 'portraits' and auth.uid() is not null
);
create policy "Users can update portraits" on storage.objects for update using (
  bucket_id = 'portraits' and auth.uid() is not null
);
create policy "Anyone can view portraits" on storage.objects for select using (
  bucket_id = 'portraits'
);
