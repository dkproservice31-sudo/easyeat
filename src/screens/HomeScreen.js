import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import { colors, spacing, typography } from '../theme/theme';

export default function HomeScreen() {
  return (
    <Screen>
      <Text style={typography.h1}>Bonjour </Text>
      <Text style={[typography.small, { marginTop: spacing.xs }]}>
        Que cuisinons-nous aujourd'hui ?
      </Text>
      <View style={styles.card}>
        <Text style={typography.h3}>Recettes populaires</Text>
        <Text style={[typography.small, { marginTop: spacing.sm }]}>
          Bientôt disponible.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
