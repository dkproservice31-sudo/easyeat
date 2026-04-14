import React, { useLayoutEffect, useState, useEffect } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import ChipGroup from '../components/ChipGroup';
import RecipePreview from '../components/RecipePreview';
import StepsList from '../components/StepsList';
import IngredientsList from '../components/IngredientsList';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { adjustRecipeServings } from '../lib/ai';
import { colors, radius, spacing, typography } from '../theme/theme';

const SERVINGS = ['1', '2', '3', '4', '5', '6'];

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

  // Adapter les portions
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [newServings, setNewServings] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjusted, setAdjusted] = useState(null);
  const [savingAdj, setSavingAdj] = useState(false);

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

  const runAdjust = async (s) => {
    setAdjusting(true);
    setAdjusted(null);
    try {
      const result = await adjustRecipeServings({
        recipe,
        newServings: parseInt(s, 10),
      });
      setAdjusted(result);
    } catch (err) {
      notify('Adaptation impossible', err.message || 'Erreur');
    } finally {
      setAdjusting(false);
    }
  };

  const saveAsNewRecipe = async () => {
    if (!adjusted || !user) return;
    setSavingAdj(true);
    const { error } = await supabase.from('recipes').insert({
      user_id: user.id,
      title: `${adjusted.title} (${newServings} pers.)`,
      description: adjusted.description || null,
      ingredients: adjusted.ingredients || null,
      steps: adjusted.steps || null,
      servings: parseInt(newServings, 10),
      duration: adjusted.duration || null,
      cooking_temp: adjusted.cooking_temp || null,
      cooking_type: adjusted.cooking_type || null,
      fat_type: adjusted.fat_type || null,
      generated_by_ai: true,
    });
    setSavingAdj(false);
    if (error) return notify('Enregistrement impossible', error.message);
    notify('Enregistrée !', 'Nouvelle recette créée.');
    setAdjusted(null);
    setAdjustOpen(false);
  };

  const replaceCurrent = async () => {
    if (!adjusted || !recipe) return;
    setSavingAdj(true);
    const updates = {
      ingredients: adjusted.ingredients || null,
      servings: parseInt(newServings, 10),
    };
    const { data, error } = await supabase
      .from('recipes')
      .update(updates)
      .eq('id', recipe.id)
      .select('*')
      .single();
    setSavingAdj(false);
    if (error) return notify('Modification impossible', error.message);
    setRecipe(data);
    setAdjusted(null);
    setAdjustOpen(false);
    notify('Mise à jour', 'Quantités mises à jour.');
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
          <IngredientsList ingredients={recipe.ingredients} />
        </Section>
      ) : null}

      {recipe.steps ? (
        <Section title="Étapes">
          <StepsList steps={recipe.steps} />
        </Section>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        {!adjustOpen ? (
          <Button
            title="Adapter les portions"
            onPress={() => {
              setAdjustOpen(true);
              setNewServings(
                recipe.servings ? String(recipe.servings) : '2'
              );
            }}
          />
        ) : (
          <View style={styles.adjustBox}>
            <Text style={styles.adjustTitle}>Adapter pour combien ?</Text>
            <ChipGroup
              options={SERVINGS}
              value={newServings}
              onChange={(v) => v && setNewServings(v)}
              disabled={adjusting || savingAdj}
            />
            <Button
              title={adjusting ? 'Recalcul...' : 'Recalculer avec l\'IA'}
              onPress={() => runAdjust(newServings)}
              loading={adjusting}
              disabled={savingAdj}
            />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Annuler"
              variant="ghost"
              onPress={() => {
                setAdjustOpen(false);
                setAdjusted(null);
              }}
              disabled={adjusting || savingAdj}
            />

            {adjusting && (
              <View style={{ alignItems: 'center', marginTop: spacing.md }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {adjusted && (
              <>
                <RecipePreview
                  recipe={{ ...adjusted, servings: newServings }}
                />
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    title="Sauvegarder comme nouvelle recette"
                    onPress={saveAsNewRecipe}
                    loading={savingAdj}
                  />
                  <View style={{ height: spacing.sm }} />
                  <Button
                    title="Remplacer la recette actuelle"
                    variant="ghost"
                    onPress={replaceCurrent}
                    disabled={savingAdj || !isOwner}
                  />
                  {!isOwner && (
                    <Text
                      style={[
                        typography.small,
                        { textAlign: 'center', marginTop: spacing.xs },
                      ]}
                    >
                      Seul le propriétaire peut remplacer la recette.
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>
        )}
      </View>
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
  adjustBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  adjustTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
});
