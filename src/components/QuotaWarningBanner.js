import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// Bandeau d'avertissement quand remaining <= 3 (mais > 0).
// Dismissible par l'utilisateur via la croix. N'affiche rien sinon.
export default function QuotaWarningBanner({ remaining }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || remaining == null) return null;
  if (remaining <= 0 || remaining > 3) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        ⚠️ Plus que {remaining} génération{remaining > 1 ? 's' : ''} IA aujourd'hui. Utilise-les bien !
      </Text>
      <Pressable
        onPress={() => setDismissed(true)}
        style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
        hitSlop={8}
        accessibilityLabel="Masquer l'avertissement"
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF4E5',
    borderWidth: 0.5,
    borderColor: '#FF9500',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 8,
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#8A4A00',
    lineHeight: 18,
  },
  close: {
    padding: 4,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A4A00',
  },
});
