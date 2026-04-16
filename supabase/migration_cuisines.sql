-- Table des cuisines/pays : gestion centralisée avec drapeau, description,
-- visibilité et planification (roulement).
CREATE TABLE IF NOT EXISTS public.cuisines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  flag text DEFAULT '🏳️',
  description text,
  visible boolean NOT NULL DEFAULT true,
  schedule_start date,
  schedule_end date,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.cuisines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tout le monde voit les cuisines" ON public.cuisines;
CREATE POLICY "Tout le monde voit les cuisines" ON public.cuisines
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Éditeur gère les cuisines" ON public.cuisines;
CREATE POLICY "Éditeur gère les cuisines" ON public.cuisines
  FOR ALL USING (public.is_editor()) WITH CHECK (public.is_editor());

INSERT INTO public.cuisines (name, display_name, flag, description, visible) VALUES
  ('française', 'Française', '🇫🇷', 'La gastronomie française, patrimoine mondial de l''UNESCO', true),
  ('italienne', 'Italienne', '🇮🇹', 'La cucina italiana, tradition et simplicité', true),
  ('espagnole', 'Espagnole', '🇪🇸', 'Tapas, paella et saveurs méditerranéennes', true),
  ('armenie', 'Arménienne', '🇦🇲', 'Une des plus anciennes cuisines du monde', true)
ON CONFLICT (name) DO NOTHING;
