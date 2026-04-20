-- ====================================================================
-- MIGRATION : ajouter la colonne mise_en_place dans recipes
-- Créée le 2026-04-17 (chantier Mode Cuisine 1/3)
-- ====================================================================
-- Stocke le résultat de l'analyse IA Chef (tâches de prep générées
-- une seule fois). Sert de cache pour éviter de re-consommer des
-- tokens Gemini à chaque lancement du mode cuisine.
--
-- Structure attendue :
-- {
--   "tasks": [
--     { "id": 1, "description": "Éplucher 2 oignons", "emoji": "🧅" },
--     ...
--   ],
--   "generated_at": "2026-04-17T12:34:56Z"
-- }
-- ====================================================================

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS mise_en_place jsonb;

COMMENT ON COLUMN public.recipes.mise_en_place IS
  'Mise en place générée par IA Chef. Array de tâches de préparation avec description et emoji. NULL si pas encore générée.';
