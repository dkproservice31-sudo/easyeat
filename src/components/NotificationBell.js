import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function NotificationBell({ urgentCount = 0, onPress }) {
  const { colors } = useTheme();

  const hasAlert = urgentCount > 0;
  const displayCount = urgentCount > 9 ? '9+' : String(urgentCount);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={
        hasAlert
          ? `${urgentCount} ingrédient${urgentCount > 1 ? 's' : ''} à vérifier`
          : 'Notifications'
      }
    >
      <View style={styles.bellWrap}>
        <Text
          style={[
            styles.bell,
            { color: hasAlert ? '#E74C3C' : colors.text },
          ]}
        >
          🔔
        </Text>
        {hasAlert ? (
          <View style={[styles.badge, { borderColor: colors.background }]}>
            <Text style={styles.badgeText}>{displayCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  bellWrap: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bell: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#E74C3C',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
});
