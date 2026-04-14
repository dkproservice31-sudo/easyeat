import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import { formatDateFr, formatTimeFr } from '../lib/dateFr';
import { colors, spacing, typography } from '../theme/theme';

export default function HomeScreen() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Aligne le prochain tick sur la minute suivante, puis tick toutes les 60s
    const msToNextMinute = 60000 - (Date.now() % 60000);
    let interval;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <Screen>
      <View style={styles.dateBlock}>
        <Text style={styles.date}>{formatDateFr(now)}</Text>
        <Text style={styles.time}>{formatTimeFr(now)}</Text>
      </View>

      <Text style={[typography.h1, { marginTop: spacing.xl }]}>Bonjour </Text>
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
  dateBlock: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  date: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  time: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.xs,
    letterSpacing: 1,
  },
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
