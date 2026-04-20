-- ====================================================================
-- MIGRATION : table weekly_menus (menus hebdomadaires IA)
-- Créée le 2026-04-17 — réintégration du feature suspendu
-- ====================================================================
-- Stocke les menus de la semaine générés par l'IA.
-- 1 menu = 7 dîners (1 par jour, lundi → dimanche).
-- Synergie péremption : focus_items garde trace des ingrédients urgents
-- utilisés pour construire le menu.
--
-- Contrainte UNIQUE(user_id, start_date) : un seul menu par semaine par user
-- (génération d'un nouveau menu écrase via upsert).
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.weekly_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  days jsonb NOT NULL,
  focus_items text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, start_date)
);

CREATE INDEX IF NOT EXISTS weekly_menus_user_date_idx
  ON public.weekly_menus(user_id, start_date DESC);

ALTER TABLE public.weekly_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own weekly menus" ON public.weekly_menus;
CREATE POLICY "Users manage own weekly menus"
  ON public.weekly_menus
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON COLUMN public.weekly_menus.start_date IS
  'Lundi de la semaine couverte par ce menu';
COMMENT ON COLUMN public.weekly_menus.days IS
  'Array JSON de 7 objets { day, recipe: { name, time, servings, ingredients:[], instructions:[] } }';
COMMENT ON COLUMN public.weekly_menus.focus_items IS
  'Noms des items urgents du frigo priorisés par l''IA dans les 3 premiers dîners';
