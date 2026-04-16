-- Messages de contact envoyés par les membres à l'admin.
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membre crée message" ON public.contact_messages;
CREATE POLICY "Membre crée message" ON public.contact_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin voit messages" ON public.contact_messages;
CREATE POLICY "Admin voit messages" ON public.contact_messages
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admin modifie messages" ON public.contact_messages;
CREATE POLICY "Admin modifie messages" ON public.contact_messages
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admin supprime messages" ON public.contact_messages;
CREATE POLICY "Admin supprime messages" ON public.contact_messages
  FOR DELETE USING (public.is_admin());
