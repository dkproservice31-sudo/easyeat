import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchAIQuota, AI_QUOTA_USER_DAILY } from '../lib/aiQuota';

// Badge discret qui affiche "🤖 X/20 aujourd'hui" avec couleur dynamique
// (vert > 10 restantes, orange 4-10, rouge <= 3, "Quota atteint" si 0).
// Refetch au focus de l'écran.
export default function AIQuotaBadge({ userId, usageType = 'user', compact = false }) {
  const [quota, setQuota] = useState({
    current: 0,
    remaining: AI_QUOTA_USER_DAILY,
    max: AI_QUOTA_USER_DAILY,
  });

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      fetchAIQuota(userId, usageType).then((q) => {
        if (!cancelled) setQuota(q);
      });
      return () => {
        cancelled = true;
      };
    }, [userId, usageType])
  );

  // Admin bypass (remaining = 999999) → badge discret bleu "illimité"
  if (quota.remaining >= 9999) {
    return (
      <View style={[styles.badge, { borderColor: '#6B8FE8', backgroundColor: 'rgba(107,143,232,0.15)' }]}>
        <Text style={[styles.text, { color: '#6B8FE8' }]}>
          🤖 Illimité
        </Text>
      </View>
    );
  }

  const color =
    quota.remaining > 10
      ? '#4ADE80'
      : quota.remaining > 3
      ? '#FF9500'
      : '#E74C3C';

  const label =
    quota.remaining === 0
      ? '🚫 Quota atteint'
      : compact
      ? `${quota.current}/${quota.max}`
      : `🤖 ${quota.current}/${quota.max} aujourd'hui`;

  return (
    <View
      style={[
        styles.badge,
        { borderColor: color, backgroundColor: `${color}20` },
      ]}
    >
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 0.5,
    alignSelf: 'flex-start',
    minHeight: 26,
    justifyContent: 'center',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});
