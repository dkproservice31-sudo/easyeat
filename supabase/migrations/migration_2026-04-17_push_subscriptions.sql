-- ====================================================================
-- MIGRATION : table push_subscriptions pour les notifications push
-- Créée le 2026-04-17 (chantier 3B-1)
-- ====================================================================
-- Stocke les subscriptions Web Push acceptées par les utilisateurs.
-- Un user peut avoir plusieurs subscriptions (plusieurs devices).
-- RLS activée : chaque user ne peut gérer que ses propres subscriptions.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Index pour requêtes par user_id (le cron retrouve les subs d'un user)
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions(user_id);

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy : l'utilisateur gère ses propres subscriptions
CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Commentaires doc
COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'URL unique du push service (FCM, Apple, etc.) à laquelle envoyer les notifications';
COMMENT ON COLUMN public.push_subscriptions.p256dh_key IS
  'Clé publique de chiffrement P-256 ECDH du client';
COMMENT ON COLUMN public.push_subscriptions.auth_key IS
  'Secret d''authentification partagé généré par le client';
COMMENT ON COLUMN public.push_subscriptions.user_agent IS
  'User-Agent du navigateur au moment de la souscription (debug / analytics)';

-- Note : last_used_at sera rafraîchi par le cron (chantier 3B-3) à
-- chaque envoi réussi pour identifier les subs inactives à nettoyer.
