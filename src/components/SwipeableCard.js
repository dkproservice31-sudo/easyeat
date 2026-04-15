import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const SWIPE_WIDTH = 80;
const SWIPE_THRESHOLD = 50;

function confirmDialog(title, message) {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

// Composant générique swipe-to-delete. Utilisé par RecipesScreen et FridgeScreen.
// Props :
//   id            — identifiant unique de la carte
//   openCardId    — id de la carte actuellement ouverte (parent)
//   onOpenChange  — (id|null) => void, notifie le parent de l'ouverture
//   onDelete      — () => void, appelé après confirmation
//   onPress       — () => void, optionnel, tap sur la carte (fermée)
//   confirmTitle  — texte de la popup (défaut "Supprimer cet élément ?")
//   confirmMessage— sous-texte (défaut "Cette action est définitive.")
//   borderRadius  — rayon du wrap (défaut 14)
//   children      — contenu de la carte
export default function SwipeableCard({
  id,
  openCardId,
  onOpenChange,
  onDelete,
  onPress,
  confirmTitle = 'Supprimer cet élément ?',
  confirmMessage = 'Cette action est définitive.',
  borderRadius = 14,
  children,
  style,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const fullSwipeLimit = screenWidth * 0.6;
  const isOpen = openCardId === id;

  useEffect(() => {
    if (!isOpen) {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }).start();
    }
  }, [isOpen, translateX]);

  const confirmFullSwipeDelete = async () => {
    const ok = await confirmDialog(confirmTitle, confirmMessage);
    if (ok) {
      onDelete();
    } else {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }).start();
      onOpenChange(null);
    }
  };

  const triggerFullSwipe = () => {
    Animated.timing(translateX, {
      toValue: -screenWidth,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      confirmFullSwipeDelete();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // N'intercepte pas les taps (laisse les enfants recevoir onPress)
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        // Vole le geste dès qu'un drag horizontal démarre
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (e, g) => {
          // Sur web, empêche le navigateur de scroller pendant un drag horizontal
          if (
            Platform.OS === 'web' &&
            e?.nativeEvent &&
            Math.abs(g.dx) > Math.abs(g.dy)
          ) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
          }
          const base = isOpen ? -SWIPE_WIDTH : 0;
          const next = Math.max(-screenWidth, Math.min(0, base + g.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const base = isOpen ? -SWIPE_WIDTH : 0;
          const final = base + g.dx;

          if (Math.abs(final) > fullSwipeLimit) {
            triggerFullSwipe();
            return;
          }

          const shouldOpen = final < -SWIPE_THRESHOLD;
          Animated.spring(translateX, {
            toValue: shouldOpen ? -SWIPE_WIDTH : 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
          if (shouldOpen && !isOpen) onOpenChange(id);
          else if (!shouldOpen && isOpen) onOpenChange(null);
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: isOpen ? -SWIPE_WIDTH : 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
        },
      }),
    [isOpen, id, onOpenChange, translateX, fullSwipeLimit, screenWidth]
  );

  const handleTapDelete = async () => {
    const ok = await confirmDialog(confirmTitle, confirmMessage);
    if (!ok) return;
    onDelete();
  };

  const handleCardPress = () => {
    if (isOpen) {
      onOpenChange(null);
      return;
    }
    if (onPress) onPress();
  };

  // Sur web, "touch-action: pan-y" dit au navigateur : le scroll vertical est
  // à lui, mais les gestes horizontaux nous reviennent (pas de capture native
  // qui bloquerait PanResponder).
  const webTouchAction =
    Platform.OS === 'web' ? { touchAction: 'pan-y' } : null;

  return (
    <View style={[styles.wrap, { borderRadius }, webTouchAction, style]}>
      <Pressable
        onPress={handleTapDelete}
        style={[
          styles.deleteBtn,
          {
            borderTopRightRadius: borderRadius,
            borderBottomRightRadius: borderRadius,
          },
        ]}
        accessibilityLabel="Supprimer"
      >
        <Text style={styles.deleteIcon}>🗑️</Text>
        <Text style={styles.deleteLabel}>Suppr.</Text>
      </Pressable>

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

const createStyles = (colors) => StyleSheet.create({
  wrap: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  deleteBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_WIDTH,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteIcon: { fontSize: 22 },
  deleteLabel: { color: colors.surface, fontSize: 11, fontWeight: '700' },
});
