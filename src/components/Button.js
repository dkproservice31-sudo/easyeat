import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius, spacing, touch } from '../theme/theme';

export default function Button({ title, onPress, variant = 'primary', loading, disabled, style }) {
  const isGhost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isGhost ? styles.ghost : styles.primary,
        pressed && !disabled && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.text, isGhost && styles.textGhost]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  text: { color: '#fff', fontSize: 16, fontWeight: '700' },
  textGhost: { color: colors.primary },
});
