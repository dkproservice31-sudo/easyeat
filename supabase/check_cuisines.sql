-- ====================================================================
-- DIAGNOSTIC : voir toutes les cuisines distinctes et leurs compteurs
-- ====================================================================

-- 1. Liste des cuisines stockées avec nombre de recettes featured publiées
select
  cuisine,
  count(*) as total,
  sum(case when published then 1 else 0 end) as publiees,
  sum(case when not published then 1 else 0 end) as depubliees
from public.recipes
where featured = true
group by cuisine
order by total desc;

-- 2. Recettes featured sans cuisine
select id, title
from public.recipes
where featured = true and (cuisine is null or trim(cuisine) = '');

-- ====================================================================
-- NORMALISATION OPTIONNELLE
-- Décommente et adapte selon ce que tu vois ci-dessus.
-- ====================================================================

-- Exemple : unifier "armenie", "arménie", "Arménienne" en "arménienne"
-- update public.recipes set cuisine = 'arménienne'
--   where lower(trim(cuisine)) in ('armenie', 'arménie', 'armenienne', 'arménienne');

-- Forcer minuscule et trim partout
-- update public.recipes
--   set cuisine = lower(trim(cuisine))
--   where cuisine is not null and cuisine <> lower(trim(cuisine));

-- Forcer published=true pour toutes les featured qui n'ont pas la valeur
-- (sécurité si la migration_published.sql a été lancée après insertion)
-- update public.recipes set published = true
--   where featured = true and published is null;
