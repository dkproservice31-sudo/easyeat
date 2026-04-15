-- ====================================================================
-- MIGRATION : champs profil (prénom, nom, âge) + RLS admin sur profiles
-- À exécuter dans Supabase > SQL Editor
-- ====================================================================

-- 1. Nouveaux champs
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists age integer
  check (age is null or (age > 0 and age < 150));

-- 2. Trigger de création auto du profil mis à jour pour récupérer
-- first_name / last_name / age depuis raw_user_meta_data
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email, first_name, last_name, age)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    nullif(new.raw_user_meta_data->>'age', '')::integer
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Le trigger existe déjà (on_auth_user_created), rien à recréer

-- 3. Politique RLS : l'admin peut voir TOUS les profils (pour la section
-- "Membres" du panneau admin).
drop policy if exists "Admin voit tous les profils" on public.profiles;
create policy "Admin voit tous les profils"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p2
      where p2.id = auth.uid() and p2.role = 'admin'
    )
  );
