-- ====================================================================
-- MIGRATION : stats de cuisine sur les recettes (chantier Mode Cuisine 3/3)
-- Créée le 2026-04-17
-- ====================================================================
-- Ajoute 4 colonnes pour tracker :
--   - times_cooked   : nombre de fois où l'user a cuisiné la recette
--   - rating         : note moyenne (1-5) arrondie à 2 décimales
--   - rating_count   : nombre de notes cumulées
--   - last_cooked_at : dernière cuisson (trigger UI "récemment cuisiné")
--
-- Déclenchées par :
--   - "✓ Terminer la cuisine" (CookingModeScreen) → stats + note
--   - "✓ Cuisiné" (raccourci swipe RecipesScreen) → stats seulement
-- ====================================================================

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS times_cooked integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating numeric(3,2),
  ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cooked_at timestamptz;

COMMENT ON COLUMN public.recipes.times_cooked IS
  'Nombre de fois où la recette a été marquée comme cuisinée par l''user';
COMMENT ON COLUMN public.recipes.rating IS
  'Note moyenne sur 5 (1 décimale). NULL si aucune note encore.';
COMMENT ON COLUMN public.recipes.rating_count IS
  'Nombre de notes cumulées (incrémenté à chaque notation)';
COMMENT ON COLUMN public.recipes.last_cooked_at IS
  'Timestamp de la dernière cuisson (pour affichage "récemment cuisinée")';
