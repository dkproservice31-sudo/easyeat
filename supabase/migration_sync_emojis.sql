-- Copie custom_emoji des recettes featured vers les copies perso des membres
-- qui ont été ajoutées AVANT que l'app ne propage custom_emoji au INSERT.
-- Match sur le titre normalisé (lowercase + trim).
UPDATE public.recipes AS perso
SET custom_emoji = featured.custom_emoji
FROM public.recipes AS featured
WHERE perso.featured = false
  AND perso.custom_emoji IS NULL
  AND featured.featured = true
  AND featured.custom_emoji IS NOT NULL
  AND LOWER(TRIM(perso.title)) = LOWER(TRIM(featured.title));
