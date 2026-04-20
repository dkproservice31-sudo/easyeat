-- ====================================================================
-- MIGRATION : Cron quotidien pour envoyer les notifs de péremption
-- Créée le 2026-04-17 (chantier 3B-3)
-- ====================================================================
-- Appelle l'Edge Function send-expiration-notifications chaque jour
-- à 12:00 UTC (14h en heure d'été française, 13h en heure d'hiver).
--
-- Dépendances : extensions pg_cron + pg_net (activées ci-dessous).
-- Authentification : le cron envoie le service_role key en Bearer
-- pour contourner verify_jwt de l'Edge Function.
--
-- ⚠️ APRÈS APPLICATION DE CETTE MIGRATION :
--    Le job est créé avec un PLACEHOLDER pour la service_role key.
--    Davo doit l'exécuter MANUELLEMENT une fois via le SQL Editor
--    Supabase (voir instructions dans le chat).
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent : retire le job existant avant de le recréer
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-expiration-notifications-daily') THEN
    PERFORM cron.unschedule('send-expiration-notifications-daily');
  END IF;
END $$;

-- Planifie le job : tous les jours à 12:00 UTC
-- La Bearer key est SERVICE_ROLE_KEY_PLACEHOLDER : à remplacer
-- manuellement via un UPDATE sur cron.job.command après migration.
SELECT cron.schedule(
  'send-expiration-notifications-daily',
  '0 12 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://hvzyvycbbzflkcmbkhiq.supabase.co/functions/v1/send-expiration-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_PLACEHOLDER'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $cron$
);
