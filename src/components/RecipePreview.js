import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import StepsList from './StepsList';
import IngredientsList from './IngredientsList';
import { formatDuration } from '../lib/formatDuration';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../contexts/ThemeContext';

function Pill({ label, value }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!value) return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

export default function RecipePreview({ recipe }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!recipe) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{recipe.title}</Text>
      {recipe.description ? (
        <Text style={styles.desc}>{recipe.description}</Text>
      ) : null}

      <View style={styles.pills}>
        <Pill label="Durée" value={recipe.duration ? formatDuration(recipe.duration) : null} />
        <Pill label="Température" value={recipe.cooking_temp ? `${recipe.cooking_temp}°C` : null} />
        <Pill label="Cuisson" value={recipe.cooking_type} />
        <Pill label="Matière grasse" value={recipe.fat_type} />
      </View>

      {recipe.ingredients ? (
        <>
          <Text style={styles.section}>Ingrédients</Text>
          <IngredientsList ingredients={recipe.ingredients} />
        </>
      ) : null}

      {recipe.steps ? (
        <>
          <Text style={styles.section}>Étapes</Text>
          <StepsList steps={recipe.steps} />
        </>
      ) : null}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.primary },
  desc: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pill: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  pillValue: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  section: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
});
