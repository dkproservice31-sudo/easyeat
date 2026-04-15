-- ====================================================================
-- MIGRATION : rôle "editor" + fonctions is_admin/is_editor
-- À exécuter dans Supabase > SQL Editor
-- ====================================================================

-- 1. Élargir la contrainte role pour accepter 'editor'
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('member', 'editor', 'admin'));

-- 2. Fonctions helper (security definer pour bypasser RLS lors des checks)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_editor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('editor', 'admin')
  );
$$;

-- 3. Policies sur profiles : l'admin peut modifier les profils (promouvoir/rétrograder)
drop policy if exists "Admin modifie les profils" on public.profiles;
create policy "Admin modifie les profils"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Refonte des policies recettes featured : utiliser is_editor()
drop policy if exists "Admin gère les featured" on public.recipes;
drop policy if exists "Admin crée des featured" on public.recipes;
drop policy if exists "Éditeur gère les featured" on public.recipes;
drop policy if exists "Éditeur crée des featured" on public.recipes;

create policy "Éditeur gère les featured"
  on public.recipes for all
  using (public.is_editor() and featured = true);

create policy "Éditeur crée des featured"
  on public.recipes for insert
  with check (public.is_editor() and featured = true);
