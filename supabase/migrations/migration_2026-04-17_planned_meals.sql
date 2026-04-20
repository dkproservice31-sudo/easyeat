-- ====================================================================
-- MIGRATION : table planned_meals pour le planning de la semaine
-- Créée le 2026-04-17
-- ====================================================================
-- Chaque ligne = 1 recette assignée à 1 jour pour 1 user.
-- recipe_snapshot en jsonb : préserve l'intégrité du planning même si
-- la recette source est supprimée (et permet les recettes IA à la volée).
--
-- completed_at / skipped_at mutuellement exclusifs (CHECK) : un plat
-- est soit cuisiné (déduit du frigo), soit retiré, soit en attente.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.planned_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  recipe_snapshot jsonb NOT NULL,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT planned_meals_status_exclusive
    CHECK (completed_at IS NULL OR skipped_at IS NULL)
);

CREATE INDEX IF NOT EXISTS planned_meals_user_date_idx
  ON public.planned_meals(user_id, planned_date);

ALTER TABLE public.planned_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own planned meals" ON public.planned_meals;
CREATE POLICY "Users manage own planned meals"
  ON public.planned_meals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON COLUMN public.planned_meals.recipe_snapshot IS
  'Copie de la recette au moment de l''ajout : {name, time, servings, ingredients:[], instructions:[]}. Immuable → protège le planning contre la suppression de la recette source.';
COMMENT ON COLUMN public.planned_meals.completed_at IS
  'Timestamp de fin de cuisson. Déclenche la déduction des ingrédients du frigo.';
COMMENT ON COLUMN public.planned_meals.skipped_at IS
  'Timestamp de retrait sans cuisson. Pas de déduction frigo.';
