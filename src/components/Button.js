import React, { useRef, useMemo } from 'react';
import {
  Animated,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { spacing } from '../theme/theme';
import { useTheme } from '../contexts/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isGhost = variant === 'ghost';
  const scale = useRef(new Animated.Value(1)).current;

  const handleIn = () => {
    if (disabled || loading) return;
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 7,
      tension: 160,
    }).start();
  };

  const handleOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 140,
    }).start();
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handleIn}
      onPressOut={handleOut}
      disabled={disabled || loading}
      style={[
        styles.base,
        isGhost ? styles.ghost : styles.primary,
        (disabled || loading) && styles.disabled,
        style,
        { transform: [{ scale }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.primary : colors.surface} />
      ) : (
        <Text style={[styles.text, isGhost && styles.textGhost]}>{title}</Text>
      )}
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
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
    borderColor: colors.border,
  },
  disabled: { opacity: 0.5 },
  text: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  textGhost: { color: colors.primary },
});
