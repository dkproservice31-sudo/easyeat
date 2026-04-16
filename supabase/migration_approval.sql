-- Validation d'inscription + bannissement.
-- Approche simplifiée : on garde le compte Supabase Auth normal, mais on gate
-- l'accès via les colonnes `approved` et `banned` sur profiles.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS requested_editor_id uuid REFERENCES public.profiles(id);

-- Les comptes admin/éditeur existants sont considérés comme déjà approuvés.
UPDATE public.profiles SET approved = true
  WHERE role IN ('admin', 'editor') AND approved = false;

-- Policy : un utilisateur peut lire son propre profil (nécessaire pour que
-- l'app connaisse son statut `approved`/`banned`). Normalement déjà en place
-- dans schema.sql.
DROP POLICY IF EXISTS "profile self read" ON public.profiles;
CREATE POLICY "profile self read" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_editor());

-- Policy : éditeur/admin peut mettre à jour approved, admin peut bannir.
DROP POLICY IF EXISTS "editor can approve" ON public.profiles;
CREATE POLICY "editor can approve" ON public.profiles
  FOR UPDATE USING (public.is_editor());
