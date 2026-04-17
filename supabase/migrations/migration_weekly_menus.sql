-- ====================================================================
-- MIGRATION : table weekly_menus (menus hebdomadaires IA)
-- Créée le 2026-04-17 pour le Studio IA (AIScreen → WeeklyMenuScreen)
-- ====================================================================
-- Stocke les menus de la semaine générés par l'IA. Chaque menu contient
-- 7 jours avec leurs repas (déjeuner / dîner) en jsonb pour rester
-- flexible : la structure pourra évoluer sans nouvelle migration.

create table if not exists public.weekly_menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  week_start date,
  meals jsonb not null,
  generated_by_ai boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists weekly_menus_user_idx
  on public.weekly_menus(user_id, created_at desc);

alter table public.weekly_menus enable row level security;

drop policy if exists "users manage own menus" on public.weekly_menus;
create policy "users manage own menus"
  on public.weekly_menus
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
