-- ====================================================================
-- MIGRATION : dates de péremption sur fridge_items
-- Créée le 2026-04-17
-- ====================================================================
-- Ajoute 2 colonnes optionnelles à fridge_items :
--   - expiration_date  : date de péremption (nullable)
--   - shelf_life_days  : durée de vie initiale en jours (nullable)
--     → sert à calculer les seuils proportionnels des pastilles
--       (fresh > 40%, soon 15-40%, urgent < 15%)
--
-- Les colonnes sont nullable pour ne PAS casser les items existants
-- sans date. L'utilisateur les renseigne progressivement ; les scans
-- (chantier 2) les rempliront automatiquement.
-- ====================================================================

ALTER TABLE public.fridge_items
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS shelf_life_days integer;

-- Index pour accélérer le tri par date de péremption (NULLS LAST)
CREATE INDEX IF NOT EXISTS fridge_items_expiration_idx
  ON public.fridge_items(user_id, expiration_date NULLS LAST);
