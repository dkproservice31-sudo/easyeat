import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { countExpiringItems } from '../lib/expirationStatus';

export default function ExpirationAlertBanner({ items, onPress }) {
  const counts = countExpiringItems(items);

  if (counts.total_alert === 0) return null;

  let icon;
  let message;
  let color;
  let bg;

  if (counts.expired > 0) {
    icon = '⚠️';
    const plural = counts.expired > 1;
    message = `${counts.expired} ingrédient${plural ? 's' : ''} périmé${plural ? 's' : ''}`;
    color = '#E74C3C';
    bg = 'rgba(231, 76, 60, 0.12)';
  } else if (counts.urgent > 0) {
    icon = '🔴';
    const plural = counts.urgent > 1;
    message = `${counts.urgent} ingrédient${plural ? 's' : ''} périme${plural ? 'nt' : ''} bientôt`;
    color = '#E74C3C';
    bg = 'rgba(231, 76, 60, 0.08)';
  } else {
    icon = '🟡';
    const plural = counts.soon > 1;
    message = `${counts.soon} ingrédient${plural ? 's' : ''} à consommer bientôt`;
    color = '#FF9500';
    bg = 'rgba(255, 149, 0, 0.1)';
  }

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.banner,
          { backgroundColor: bg, borderColor: color },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={message}
      >
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.message, { color }]} numberOfLines={2}>
          {message}
        </Text>
        <Text style={[styles.chevron, { color }]}>›</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: bg, borderColor: color },
      ]}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.message, { color }]} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  icon: {
    fontSize: 18,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
    fontWeight: '600',
  },
});
