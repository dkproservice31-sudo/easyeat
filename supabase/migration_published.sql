-- ====================================================================
-- MIGRATION : flag "published" sur les recettes featured
-- À exécuter dans Supabase > SQL Editor
-- ====================================================================

alter table public.recipes
  add column if not exists published boolean not null default true;

-- Index pour filtrer rapidement les recettes visibles sur l'accueil
create index if not exists recipes_featured_published_idx
  on public.recipes(featured, published)
  where featured = true and published = true;
