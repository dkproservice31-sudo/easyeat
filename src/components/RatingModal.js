import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// Modale de notation 5 étoiles.
// Props :
//   - visible : bool
//   - recipeName : string (affiché dans le sous-titre)
//   - onClose : () => void (ferme sans action)
//   - onSubmit : (rating: number 1-5) => void
//   - onSkip : () => void (passe sans noter, ferme la modale)
export default function RatingModal({
  visible,
  recipeName,
  onClose,
  onSubmit,
  onSkip,
}) {
  const { colors } = useTheme();
  const [rating, setRating] = useState(0);

  // Reset à chaque réouverture
  useEffect(() => {
    if (visible) setRating(0);
  }, [visible]);

  const handleSubmit = () => {
    if (rating < 1 || rating > 5) return;
    onSubmit(rating);
  };

  const handleSkip = () => {
    onSkip();
  };

  const LABELS = {
    1: '👎 Pas terrible',
    2: '😐 Moyen',
    3: '👌 Correct',
    4: '😋 Très bon',
    5: '🔥 Excellent !',
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <Text style={styles.emoji}>🍽️</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Bon appétit !
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Comment as-tu trouvé « {recipeName || 'cette recette'} » ?
          </Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Note ${star} étoile${star > 1 ? 's' : ''}`}
              >
                <Text style={styles.star}>
                  {star <= rating ? '⭐' : '☆'}
                </Text>
              </Pressable>
            ))}
          </View>

          {rating > 0 ? (
            <Text style={[styles.ratingLabel, { color: colors.primary }]}>
              {LABELS[rating]}
            </Text>
          ) : (
            <Text style={[styles.ratingLabel, { color: colors.textSecondary, opacity: 0.5 }]}>
              Touche une étoile pour noter
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={handleSkip}
              style={({ pressed }) => [
                styles.btnSkip,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.btnSkipText, { color: colors.textSecondary }]}>
                Passer
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={rating === 0}
              style={({ pressed }) => [
                styles.btnSubmit,
                { backgroundColor: colors.primary },
                rating === 0 && { opacity: 0.4 },
                pressed && rating > 0 && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.btnSubmitText}>Valider la note</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  star: {
    fontSize: 40,
    lineHeight: 46,
  },
  ratingLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 8,
    minHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },
  btnSkip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnSkipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  btnSubmit: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
