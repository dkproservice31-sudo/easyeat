-- Suggestions de recettes proposées par les membres à l'admin/éditeur.
CREATE TABLE IF NOT EXISTS public.recipe_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  cuisine text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.recipe_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membre voit ses suggestions" ON public.recipe_suggestions;
CREATE POLICY "Membre voit ses suggestions" ON public.recipe_suggestions
  FOR SELECT USING (user_id = auth.uid() OR public.is_editor());

DROP POLICY IF EXISTS "Membre crée suggestion" ON public.recipe_suggestions;
CREATE POLICY "Membre crée suggestion" ON public.recipe_suggestions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Éditeur gère suggestions" ON public.recipe_suggestions;
CREATE POLICY "Éditeur gère suggestions" ON public.recipe_suggestions
  FOR UPDATE USING (public.is_editor());

DROP POLICY IF EXISTS "Éditeur supprime suggestions" ON public.recipe_suggestions;
CREATE POLICY "Éditeur supprime suggestions" ON public.recipe_suggestions
  FOR DELETE USING (public.is_editor());
