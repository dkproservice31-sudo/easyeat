-- Emoji personnalisé assigné manuellement par admin/éditeur à une recette.
-- Quand NULL, l'app retombe sur le mapping automatique depuis le titre.
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS custom_emoji text;
