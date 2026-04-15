import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

// Pressable avec un effet de scale au press. L'Animated.View EXTÉRIEUR porte
// le transform ; le Pressable INTÉRIEUR garde son propre style (flex, fond,
// bordure, padding…). Évite les conflits de layout et préserve
// l'apparence quand on wrap des cartes ou des chips.
export default function PressableScale({
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  style,
  children,
  scaleTo = 0.95,
  hitSlop,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleIn = (e) => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: scaleTo,
      useNativeDriver: true,
      friction: 7,
      tension: 160,
    }).start();
    if (onPressIn) onPressIn(e);
  };

  const handleOut = (e) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 140,
    }).start();
    if (onPressOut) onPressOut(e);
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handleIn}
        onPressOut={handleOut}
        disabled={disabled}
        style={style}
        hitSlop={hitSlop}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
