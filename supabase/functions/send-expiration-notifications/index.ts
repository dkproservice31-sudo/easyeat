// Edge Function : envoie les notifs push pour items expirant bientôt
// Déclenchée par le cron Supabase chaque jour à midi UTC (chantier 3B-3)
// - "Urgents" = périmés (date passée), aujourd'hui, ou demain
// - Groupement par user, 1 notif max par subscription
// - Nettoyage automatique des subscriptions mortes (404/410)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

interface FridgeItem {
  id: string;
  user_id: string;
  name: string;
  expiration_date: string;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildNotificationPayload(items: FridgeItem[]): NotificationPayload {
  const count = items.length;
  let body: string;

  if (count === 1) {
    body = `${capitalize(items[0].name)} à consommer vite !`;
  } else if (count <= 3) {
    const names = items.map((i) => i.name);
    const allButLast = names.slice(0, -1).join(', ');
    const last = names[names.length - 1];
    body = `${capitalize(allButLast)} et ${last} sont à consommer vite !`;
  } else {
    body = `${count} ingrédients à consommer vite !`;
  }

  return {
    title: '🔴 EasyEat',
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'easyeat-expiration',
    data: {
      type: 'expiration',
      item_ids: items.map((i) => i.id),
    },
  };
}

Deno.serve(async (req: Request) => {
  // CORS pour les invocations manuelles de test
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject =
      Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@easyeat.app';

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({
          error: 'missing_vapid_keys',
          message:
            'VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY doivent être configurés dans les secrets Edge Function',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Borne haute : aujourd'hui + 1 jour (couvre périmés, aujourd'hui, demain)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);
    const tomorrowISO = tomorrow.toISOString().split('T')[0];

    const { data: urgentItems, error: itemsError } = await supabase
      .from('fridge_items')
      .select('id, user_id, name, expiration_date')
      .not('expiration_date', 'is', null)
      .lte('expiration_date', tomorrowISO);

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
      return new Response(
        JSON.stringify({ error: 'fetch_items_failed', detail: itemsError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!urgentItems || urgentItems.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No urgent items',
          sent: 0,
          users_notified: 0,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const itemsByUser = new Map<string, FridgeItem[]>();
    for (const item of urgentItems as FridgeItem[]) {
      const list = itemsByUser.get(item.user_id) || [];
      list.push(item);
      itemsByUser.set(item.user_id, list);
    }

    const userIds = Array.from(itemsByUser.keys());
    const { data: subscriptions, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh_key, auth_key')
      .in('user_id', userIds);

    if (subsError) {
      console.error('Error fetching subscriptions:', subsError);
      return new Response(
        JSON.stringify({ error: 'fetch_subs_failed', detail: subsError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No subscriptions for users with urgent items',
          users_concerned: userIds.length,
          sent: 0,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    let successCount = 0;
    let failureCount = 0;
    const staleSubscriptions: string[] = [];

    for (const sub of subscriptions as PushSubscriptionRow[]) {
      const userItems = itemsByUser.get(sub.user_id) || [];
      if (userItems.length === 0) continue;

      const payload = buildNotificationPayload(userItems);

      const webpushSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh_key,
          auth: sub.auth_key,
        },
      };

      try {
        await webpush.sendNotification(webpushSub, JSON.stringify(payload), {
          TTL: 60 * 60 * 12,
        });
        successCount++;

        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id);
      } catch (err) {
        failureCount++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        const body = (err as { body?: string }).body;
        console.error(`Push failed for sub ${sub.id}:`, statusCode, body);

        // 404 = not found, 410 = gone → subscription morte à nettoyer
        if (statusCode === 404 || statusCode === 410) {
          staleSubscriptions.push(sub.id);
        }
      }
    }

    if (staleSubscriptions.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', staleSubscriptions);
    }

    return new Response(
      JSON.stringify({
        message: 'Done',
        users_concerned: userIds.length,
        subscriptions_total: subscriptions.length,
        sent: successCount,
        failed: failureCount,
        cleaned_stale: staleSubscriptions.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: (err as Error).message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
