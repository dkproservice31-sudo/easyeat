import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../contexts/ThemeContext';

// Sépare le texte en étapes. Gère deux cas :
// 1) Étapes séparées par saut de ligne, avec ou sans numérotation.
// 2) Étapes en ligne comme "1. Faire X 2. Faire Y 3. Faire Z" sans retour ligne.
//
// Pour éviter les faux positifs (ex: "180°C." ou "cuire 5 minutes"), on ne
// découpe sur les marqueurs numériques que si leurs numéros forment une
// séquence croissante commençant à 1 (1, 2, 3...).
function parseSteps(raw) {
  if (!raw) return [];

  const markerRe = /(\d+)\s*[\.\)\-:]\s+/g;
  const matches = [];
  let m;
  while ((m = markerRe.exec(raw)) !== null) {
    matches.push({ num: parseInt(m[1], 10), index: m.index, length: m[0].length });
  }

  // Conserve les marqueurs qui forment la séquence 1, 2, 3, ...
  const seq = [];
  let expected = 1;
  for (const match of matches) {
    if (match.num === expected) {
      seq.push(match);
      expected++;
    }
  }

  if (seq.length >= 2) {
    const steps = [];
    for (let i = 0; i < seq.length; i++) {
      const start = seq[i].index + seq[i].length;
      const end = i + 1 < seq.length ? seq[i + 1].index : raw.length;
      steps.push(raw.slice(start, end).trim());
    }
    return steps.filter(Boolean);
  }

  // Cas particulier : un seul marqueur trouvé (étape unique numérotée)
  // → on le retire et on retourne le texte restant.
  if (seq.length === 1) {
    const start = seq[0].index + seq[0].length;
    const only = raw.slice(start).trim();
    if (only) return [only];
  }

  // Fallback : séparation par lignes
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\d+\s*[\.\)\-:]\s*/, '').trim())
    .filter(Boolean);
}

export default function StepsList({ steps }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const list = parseSteps(steps);
  if (list.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {list.map((text, i) => (
        <View key={i} style={styles.bubble}>
          <View style={styles.circle}>
            <Text style={styles.circleText}>{i + 1}</Text>
          </View>
          <Text style={styles.text}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: {
    gap: 10,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: spacing.sm,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  circleText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    paddingTop: 3,
  },
});
