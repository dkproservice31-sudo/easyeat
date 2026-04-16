-- Ajoute la colonne dish_type aux recettes pour le filtre par type de plat.
-- Valeurs attendues : 'viande', 'poisson', 'vegan', 'végétarien', 'dessert', 'tout'.
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS dish_type text NOT NULL DEFAULT 'tout';
