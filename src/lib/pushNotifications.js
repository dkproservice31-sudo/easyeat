// Helpers Web Push pour EasyEat.
// Dépend du Service Worker public/sw.js (handlers push + notificationclick).
// La clé publique VAPID est lue depuis EXPO_PUBLIC_VAPID_PUBLIC_KEY.

import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPermissionState() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.warn('[Push] SW register failed:', err);
    return null;
  }
}

export async function subscribeToPush(userId) {
  if (!isPushSupported()) return false;
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID public key manquante dans .env');
    return false;
  }
  if (!userId) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;

    // Désabonne toute souscription existante pour repartir propre
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJson = subscription.toJSON();

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subJson.endpoint,
        p256dh_key: subJson.keys.p256dh,
        auth_key: subJson.keys.auth,
        user_agent: navigator.userAgent || null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) {
      console.warn('[Push] Save subscription failed:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[Push] Subscribe failed:', err);
    return false;
  }
}

export async function unsubscribeFromPush(userId) {
  if (!isPushSupported()) return false;
  if (!userId) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
    }

    return true;
  } catch (err) {
    console.warn('[Push] Unsubscribe failed:', err);
    return false;
  }
}

export async function sendTestNotification() {
  if (!isPushSupported()) {
    return {
      success: false,
      error: 'Notifications non supportées sur cet appareil',
    };
  }
  if (getPermissionState() !== 'granted') {
    return {
      success: false,
      error: 'Permission notifications non accordée',
    };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('🧪 Test EasyEat', {
      body: 'Si tu vois cette notif, le système fonctionne ! 🎉',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'easyeat-test',
      data: { type: 'test', timestamp: Date.now() },
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Erreur inconnue' };
  }
}

export async function isSubscribed() {
  if (!isPushSupported()) return false;
  if (getPermissionState() !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
