// Wrapper de quota IA. Encapsule les appels aux RPC Supabase
// (increment_ai_usage, get_ai_usage) et aux RPC admin dashboard.
// Mode dégradé : si la table/RPC n'existe pas (migration pas jouée),
// on warn console et on laisse passer l'appel — évite de bloquer
// toute l'app pendant la transition.

import { supabase } from './supabase';

export const AI_QUOTA_USER_DAILY = 20;
export const AI_QUOTA_EDITOR_ADMIN_DAILY = 50;

export class AIQuotaExceededError extends Error {
  constructor(usageType = 'user') {
    super('Quota IA journalier atteint');
    this.name = 'AIQuotaExceededError';
    this.usageType = usageType;
  }
}

function isQuotaExceeded(error) {
  if (!error) return false;
  if (error.code === 'P0001') return true;
  const msg = (error.message || '').toLowerCase();
  return msg.includes('quota exceeded');
}

function isForbidden(error) {
  if (!error) return false;
  if (error.code === '42501') return true;
  const msg = (error.message || '').toLowerCase();
  return msg.includes('forbidden');
}

// Incrémente le compteur ET log l'appel. Lance AIQuotaExceededError
// si le quota est dépassé. Si la RPC n'existe pas → warn + laisse passer.
export async function checkAndIncrementAIQuota(userId, usageType, functionName) {
  if (!userId) {
    console.warn(
      `[aiQuota] ${functionName} appelée sans userId — quota non compté`
    );
    return null;
  }
  const { data, error } = await supabase.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_usage_type: usageType || 'user',
    p_function_name: functionName,
  });
  if (error) {
    if (isQuotaExceeded(error)) {
      throw new AIQuotaExceededError(usageType);
    }
    if (isForbidden(error)) {
      throw new Error('Accès refusé pour cette fonction IA.');
    }
    // Erreur inconnue (RPC absente, etc.) : on laisse passer en warn
    console.warn('[aiQuota] increment error, laisse passer :', error.message);
    return null;
  }
  if (!data || !data[0]) return null;
  return {
    current: data[0].new_count,
    remaining: data[0].remaining,
    max: data[0].max_quota,
  };
}

// Lecture seule (pour afficher le badge sans incrémenter)
export async function fetchAIQuota(userId, usageType = 'user') {
  const fallback = {
    current: 0,
    remaining:
      usageType === 'admin'
        ? AI_QUOTA_EDITOR_ADMIN_DAILY
        : AI_QUOTA_USER_DAILY,
    max:
      usageType === 'admin'
        ? AI_QUOTA_EDITOR_ADMIN_DAILY
        : AI_QUOTA_USER_DAILY,
  };
  if (!userId) return fallback;
  const { data, error } = await supabase.rpc('get_ai_usage', {
    p_user_id: userId,
    p_usage_type: usageType,
  });
  if (error || !data || !data[0]) {
    return fallback;
  }
  return {
    current: data[0].current_count,
    remaining: data[0].remaining,
    max: data[0].max_quota,
  };
}

// ========== ADMIN DASHBOARD ==========

export async function fetchAdminDashboardToday() {
  const { data, error } = await supabase.rpc('get_ai_usage_today_total');
  if (error || !data || !data[0]) {
    return { total: 0, breakdown: [] };
  }
  return {
    total: data[0].total_count ?? 0,
    breakdown: Array.isArray(data[0].breakdown_by_function)
      ? data[0].breakdown_by_function
      : [],
  };
}

export async function fetchAdminTopUsers(limit = 10) {
  const { data, error } = await supabase.rpc('get_ai_usage_top_users', {
    p_limit: limit,
  });
  if (error || !data) return [];
  return data;
}

export async function fetchAdminLast7Days() {
  const { data, error } = await supabase.rpc('get_ai_usage_last_7_days');
  if (error || !data) return [];
  return data;
}
