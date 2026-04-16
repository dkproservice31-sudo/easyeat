-- Notes et avis sur les recettes featured.
CREATE TABLE IF NOT EXISTS public.ratings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, recipe_id)
);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tout le monde voit les notes" ON public.ratings;
CREATE POLICY "Tout le monde voit les notes" ON public.ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Membre crée sa note" ON public.ratings;
CREATE POLICY "Membre crée sa note" ON public.ratings FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Membre modifie sa note" ON public.ratings;
CREATE POLICY "Membre modifie sa note" ON public.ratings FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Membre supprime sa note" ON public.ratings;
CREATE POLICY "Membre supprime sa note" ON public.ratings FOR DELETE USING (user_id = auth.uid());
