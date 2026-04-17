import React, { useMemo, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
  useWindowDimensions,
} from 'react-native';

const ACTIVATION_DISTANCE = 4; // seuil minimal de mouvement pour activer
const DIRECTIONAL_RATIO = 1.4; // dx doit être au moins 1.4x plus grand que dy

// Composant générique swipe-to-delete (style Apple Mail).
// Props :
//   onDelete      — () => void, appelé après full swipe
//   onPress       — () => void, optionnel, tap sur la carte
//   confirmTitle  — conservé pour compatibilité (non utilisé)
//   confirmMessage— conservé pour compatibilité (non utilisé)
//   borderRadius  — rayon du wrap (défaut 14)
//   children      — contenu de la carte
export default function SwipeableCard({
  /* deprecated, kept for backward compatibility */
  id,
  /* deprecated, kept for backward compatibility */
  openCardId,
  /* deprecated, kept for backward compatibility */
  onOpenChange,
  onDelete,
  onPress,
  confirmTitle = 'Supprimer cet élément ?',
  confirmMessage = 'Cette action est définitive.',
  borderRadius = 14,
  children,
  style,
}) {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const fullSwipeLimit = screenWidth * 0.5;

  // Interpolation : |translateX| de 0 à fullSwipeLimit → fond progressif
  const backgroundColor = translateX.interpolate({
    inputRange: [
      -fullSwipeLimit,
      -fullSwipeLimit * 0.5,
      0
    ],
    outputRange: [
      '#E74C3C',  // rouge vif à 50% de swipe
      '#F39C7F',  // rouge orangé à 25%
      '#EFEFEF'   // gris clair à 0%
    ],
    extrapolate: 'clamp',
  });

  const triggerFullSwipe = () => {
    Animated.timing(translateX, {
      toValue: -screenWidth,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDelete();
    });
  };

  const panResponder = useMemo(
    () => {
      const shouldCaptureSwipe = (g) => {
        const absDx = Math.abs(g.dx);
        const absDy = Math.abs(g.dy);
        if (absDx <= ACTIVATION_DISTANCE) return false;
        if (absDx <= DIRECTIONAL_RATIO * absDy) return false;
        if (g.dx >= 0) return false;
        return true;
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => shouldCaptureSwipe(g),
        onMoveShouldSetPanResponderCapture: (_, g) => shouldCaptureSwipe(g),
        onPanResponderMove: (e, g) => {
          if (
            Platform.OS === 'web' &&
            e?.nativeEvent &&
            Math.abs(g.dx) > Math.abs(g.dy)
          ) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
          }
          const base = 0;
          const next = Math.max(-screenWidth, Math.min(0, base + g.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const base = 0;
          const final = base + g.dx;

          if (Math.abs(final) > fullSwipeLimit) {
            triggerFullSwipe();
            return;
          }

          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
        },
      });
    },
    [translateX, fullSwipeLimit, screenWidth]
  );

  const handleCardPress = () => {
    if (onPress) onPress();
  };

  const webTouchAction =
    Platform.OS === 'web' ? { touchAction: 'pan-y' } : null;

  return (
    <View style={[styles.wrap, { borderRadius }, webTouchAction, style]}>
      <Animated.View
        style={[styles.backgroundLayer, { backgroundColor, borderRadius }]}
        pointerEvents="none"
      />
      <Animated.View
        style={[{ transform: [{ translateX }] }, webTouchAction]}
        {...panResponder.panHandlers}
      >
        {onPress !== undefined ? (
          <Pressable onPress={handleCardPress}>{children}</Pressable>
        ) : (
          children
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
