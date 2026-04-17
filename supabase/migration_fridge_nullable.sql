-- Migration : rendre la colonne quantity nullable dans fridge_items
-- Date : 2026-04-17
-- Raison : permettre d'ajouter des ingrédients sans quantité
--   (épices, herbes, "un peu de...", etc.)

ALTER TABLE fridge_items
  ALTER COLUMN quantity DROP NOT NULL;

-- Vérification (optionnel) :
-- SELECT column_name, is_nullable, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'fridge_items' AND column_name = 'quantity';
