-- ====================================================================
-- MIGRATION ROLES ADMIN/MEMBER
-- À exécuter dans Supabase > SQL Editor
-- ====================================================================

-- 1. Colonne role dans profiles
alter table public.profiles
  add column if not exists role text not null default 'member'
  check (role in ('member', 'admin'));

-- 2. Promouvoir le compte rubo-davo@hotmail.fr en admin
update public.profiles
  set role = 'admin'
  where email = 'rubo-davo@hotmail.fr';

-- ====================================================================
-- 3. Politiques RLS sur recipes
-- On retire toutes les anciennes policies et on reconstruit
-- ====================================================================

drop policy if exists "recipes are viewable by everyone" on public.recipes;
drop policy if exists "users can view own or featured recipes" on public.recipes;
drop policy if exists "users can insert own recipes" on public.recipes;
drop policy if exists "users can update own recipes" on public.recipes;
drop policy if exists "users can delete own recipes" on public.recipes;
drop policy if exists "Featured visible par tous" on public.recipes;
drop policy if exists "Proprio voit ses recettes" on public.recipes;
drop policy if exists "Proprio crée ses recettes" on public.recipes;
drop policy if exists "Proprio modifie ses recettes" on public.recipes;
drop policy if exists "Proprio supprime ses recettes" on public.recipes;
drop policy if exists "Admin gère les featured" on public.recipes;
drop policy if exists "Admin crée des featured" on public.recipes;

-- Tout le monde (même non connecté) voit les recettes featured
create policy "Featured visible par tous"
  on public.recipes for select
  using (featured = true);

-- Le propriétaire voit ses recettes perso
create policy "Proprio voit ses recettes"
  on public.recipes for select
  using (featured = false and user_id = auth.uid());

-- Le propriétaire crée ses propres recettes perso
create policy "Proprio crée ses recettes"
  on public.recipes for insert
  with check (featured = false and user_id = auth.uid());

-- Le propriétaire modifie ses recettes perso
create policy "Proprio modifie ses recettes"
  on public.recipes for update
  using (user_id = auth.uid() and featured = false);

-- Le propriétaire supprime ses recettes perso
create policy "Proprio supprime ses recettes"
  on public.recipes for delete
  using (user_id = auth.uid() and featured = false);

-- Admin gère les featured (select/update/delete)
create policy "Admin gère les featured"
  on public.recipes for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    and featured = true
  );

-- Admin crée des featured
create policy "Admin crée des featured"
  on public.recipes for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    and featured = true
  );
