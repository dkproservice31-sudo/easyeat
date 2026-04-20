import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
  useWindowDimensions,
} from 'react-native';

const ACTIVATION_DISTANCE = 4; // seuil minimal de mouvement pour activer
const DIRECTIONAL_RATIO = 1.4; // dx doit être au moins 1.4x plus grand que dy

// Composant swipe style Apple Mail.
// Swipe GAUCHE (toujours actif) → onDelete (full-swipe 50%)
// Swipe DROIT (actif si onMarkCooked fourni) → onMarkCooked (full-swipe 50%)
//
// Props :
//   onDelete      — () => void, full-swipe gauche (suppression)
//   onMarkCooked  — () => void, optionnel, full-swipe droit (marquer cuisiné)
//   onPress       — () => void, optionnel, tap sur la carte
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
  onMarkCooked,
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
  const allowRightSwipe = typeof onMarkCooked === 'function';

  // Fond : rouge (gauche = delete) OU vert (droite = cooked).
  // L'input range va de -fullSwipe à +fullSwipe.
  const backgroundColor = translateX.interpolate({
    inputRange: [
      -fullSwipeLimit,
      -fullSwipeLimit * 0.5,
      0,
      fullSwipeLimit * 0.5,
      fullSwipeLimit,
    ],
    outputRange: [
      '#E74C3C', // rouge vif
      '#F39C7F', // rouge orangé
      '#EFEFEF', // gris clair au repos
      '#86EFAC', // vert pâle
      '#22C55E', // vert vif
    ],
    extrapolate: 'clamp',
  });

  // Opacity du label gauche (visible si translateX < 0)
  const leftLabelOpacity = translateX.interpolate({
    inputRange: [-fullSwipeLimit, -10, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: 'clamp',
  });
  const rightLabelOpacity = translateX.interpolate({
    inputRange: [0, 10, fullSwipeLimit],
    outputRange: [0, 0.3, 1],
    extrapolate: 'clamp',
  });

  const triggerDelete = () => {
    Animated.timing(translateX, {
      toValue: -screenWidth,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDelete && onDelete();
    });
  };

  const triggerCooked = () => {
    Animated.timing(translateX, {
      toValue: screenWidth,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Reset la carte après l'action (on veut pas faire disparaître
      // la carte comme une suppression — juste marquer cuisinée puis
      // revenir à sa position).
      translateX.setValue(0);
      onMarkCooked && onMarkCooked();
    });
  };

  const panResponder = useMemo(
    () => {
      const shouldCaptureSwipe = (g) => {
        const absDx = Math.abs(g.dx);
        const absDy = Math.abs(g.dy);
        if (absDx <= ACTIVATION_DISTANCE) return false;
        if (absDx <= DIRECTIONAL_RATIO * absDy) return false;
        // Swipe droit : uniquement si onMarkCooked fourni
        if (g.dx > 0 && !allowRightSwipe) return false;
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
          // Borne : [-screenWidth, screenWidth] si onMarkCooked dispo,
          // sinon [-screenWidth, 0] (swipe droit désactivé).
          const minX = -screenWidth;
          const maxX = allowRightSwipe ? screenWidth : 0;
          const next = Math.max(minX, Math.min(maxX, g.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const final = g.dx;

          if (final < -fullSwipeLimit) {
            triggerDelete();
            return;
          }
          if (allowRightSwipe && final > fullSwipeLimit) {
            triggerCooked();
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
    [translateX, fullSwipeLimit, screenWidth, allowRightSwipe]
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
      >
        <Animated.View
          style={[styles.labelLeft, { opacity: rightLabelOpacity }]}
          pointerEvents="none"
        >
          {allowRightSwipe ? (
            <Text style={styles.labelText}>✓ Cuisiné</Text>
          ) : null}
        </Animated.View>
        <Animated.View
          style={[styles.labelRight, { opacity: leftLabelOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.labelText}>Supprimer</Text>
        </Animated.View>
      </Animated.View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  labelLeft: {
    // Révélé par swipe DROIT → apparaît à gauche (là où la carte s'éloigne)
    // Label "✓ Cuisiné" (vert)
  },
  labelRight: {
    // Révélé par swipe GAUCHE → apparaît à droite
    // Label "Supprimer" (rouge)
    marginLeft: 'auto',
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
