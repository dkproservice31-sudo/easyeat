import React, { useLayoutEffect, useState, useEffect } from 'react';
import { Text, View, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import Screen from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing, typography } from '../theme/theme';

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

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function InfoPill({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function HeaderActions({ onEdit, onDelete, busy }) {
  return (
    <View style={styles.headerActions}>
      <Pressable
        onPress={onEdit}
        disabled={busy}
        style={({ pressed }) => [
          styles.iconBtn,
          { backgroundColor: '#FFF1E8' },
          pressed && styles.iconBtnPressed,
          busy && { opacity: 0.5 },
        ]}
        accessibilityLabel="Modifier la recette"
        hitSlop={6}
      >
        <Text style={[styles.iconText, { color: colors.primary }]}>✎</Text>
      </Pressable>
      <Pressable
        onPress={onDelete}
        disabled={busy}
        style={({ pressed }) => [
          styles.iconBtn,
          { backgroundColor: '#FDECEE' },
          pressed && styles.iconBtnPressed,
          busy && { opacity: 0.5 },
        ]}
        accessibilityLabel="Supprimer la recette"
        hitSlop={6}
      >
        <Text style={[styles.iconText, { color: colors.error }]}>🗑</Text>
      </Pressable>
    </View>
  );
}

export default function RecipeDetailScreen({ route, navigation }) {
  const { user } = useAuth();
  const [recipe, setRecipe] = useState(route.params?.recipe ?? null);
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!user && recipe?.user_id === user.id;

  // Met à jour la recette locale si on revient depuis Edit avec une version modifiée
  useEffect(() => {
    if (route.params?.recipe) setRecipe(route.params.recipe);
  }, [route.params?.recipe]);

  const onDelete = async () => {
    if (!recipe) return;
    const ok = await confirmDialog(
      'Supprimer cette recette ?',
      'Cette action est définitive.'
    );
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipe.id);
    setDeleting(false);
    if (error) return notify('Suppression impossible', error.message);
    navigation.goBack();
  };

  const onEdit = () => {
    navigation.navigate('EditRecipe', { recipe });
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isOwner ? (
          <HeaderActions
            onEdit={onEdit}
            onDelete={onDelete}
            busy={deleting}
          />
        ) : null,
    });
  }, [navigation, isOwner, deleting, recipe?.id]);

  if (!recipe) {
    return (
      <Screen>
        <Text style={typography.body}>Recette introuvable.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[typography.h1, { color: colors.primary }]}>
        {recipe.title}
      </Text>
      {recipe.description ? (
        <Text style={[typography.body, styles.description]}>
          {recipe.description}
        </Text>
      ) : null}

      <View style={styles.pills}>
        <InfoPill
          label="Durée"
          value={recipe.duration ? `${recipe.duration} min` : null}
        />
        <InfoPill
          label="Personnes"
          value={recipe.servings ? `${recipe.servings}` : null}
        />
        <InfoPill
          label="Température"
          value={recipe.cooking_temp ? `${recipe.cooking_temp}°C` : null}
        />
        <InfoPill label="Cuisson" value={recipe.cooking_type} />
        <InfoPill label="Matière grasse" value={recipe.fat_type} />
      </View>

      {recipe.ingredients ? (
        <Section title="Ingrédients">
          <Text style={styles.body}>{recipe.ingredients}</Text>
        </Section>
      ) : null}

      {recipe.steps ? (
        <Section title="Étapes">
          <Text style={styles.body}>{recipe.steps}</Text>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  description: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    lineHeight: 22,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 96,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  section: { marginTop: spacing.xl },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
  iconText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
});
