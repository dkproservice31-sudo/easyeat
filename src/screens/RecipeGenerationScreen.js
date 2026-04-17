import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { generateRecipeFromFridge } from '../lib/ai';
import { AIQuotaExceededError, fetchAIQuota } from '../lib/aiQuota';
import AIQuotaBadge from '../components/AIQuotaBadge';
import QuotaWarningBanner from '../components/QuotaWarningBanner';
import { getCountryFlag } from '../lib/countryFlags';
import { formatIngredient } from '../lib/formatIngredient';
import { spacing, radius, maxContentWidth } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

// Normalisation accents + casse pour recroiser in_fridge côté client
// au cas où Gemini se trompe sur la comparaison.
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesFridge(name, fridgeNames) {
  const n = normalize(name);
  if (!n) return false;
  for (const f of fridgeNames) {
    if (n === f || n.includes(f) || f.includes(n)) return true;
  }
  return false;
}

const LOADING_MESSAGES = [
  'Notre IA explore ton frigo...',
  'Pioche dans 1000 recettes du monde...',
  'Crée la recette parfaite pour toi...',
  'Vérifie les proportions...',
];

const DISH_EMOJI = {
  viande: '🥩',
  poisson: '🐟',
  vegan: '🌱',
  'végétarien': '🥗',
  dessert: '🍰',
};

export default function RecipeGenerationScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [status, setStatus] = useState('loading'); // loading | success | error
  const [recipe, setRecipe] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const fridgeNamesRef = useRef([]);

  // Rotation des messages pendant le chargement
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const it = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(it);
  }, [status]);

  const run = async () => {
    if (!user) return;
    setStatus('loading');
    setRecipe(null);
    setErrorMsg('');
    setLoadingMsgIdx(0);
    try {
      const { data: fridgeData } = await supabase
        .from('fridge_items')
        .select('name, quantity, unit')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const fridge = fridgeData ?? [];
      fridgeNamesRef.current = fridge.map((i) => normalize(i.name));

      const r = await generateRecipeFromFridge(fridge, user?.id);
      // Recroiser in_fridge côté client pour corriger d'éventuelles erreurs de Gemini
      const ingredients = (r.ingredients || []).map((ing) => ({
        ...ing,
        in_fridge:
          ing.in_fridge === true ||
          matchesFridge(ing.name, fridgeNamesRef.current),
      }));
      setRecipe({ ...r, ingredients });
      setStatus('success');
    } catch (err) {
      if (err instanceof AIQuotaExceededError) {
        setErrorMsg(
          "Tu as atteint ta limite quotidienne de 20 générations IA. Reviens demain !"
        );
      } else {
        setErrorMsg(err?.message || 'Une erreur est survenue. Réessayez.');
      }
      setStatus('error');
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ingredientsText = (ingredients) =>
    ingredients
      .map((i) => formatIngredient(i))
      .filter(Boolean)
      .join('\n');

  const stepsText = (steps) =>
    steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

  const onSave = async () => {
    if (!recipe || !user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      title: recipe.title,
      description: recipe.description || null,
      ingredients: ingredientsText(recipe.ingredients || []),
      steps: stepsText(recipe.steps || []),
      servings: recipe.servings || null,
      duration: recipe.duration || null,
      cooking_temp: recipe.cooking_temp || null,
      cooking_type: recipe.cooking_type || null,
      fat_type: recipe.fat_type || null,
      dish_type: recipe.dish_type || 'tout',
      cuisine: recipe.cuisine || null,
      generated_by_ai: true,
      featured: false,
      published: false,
    };
    const { data, error } = await supabase
      .from('recipes')
      .insert(payload)
      .select('*')
      .single();
    setSaving(false);
    if (error) {
      notify('Enregistrement impossible', error.message);
      return;
    }
    // React Navigation remonte la hiérarchie (FridgeStack → Tabs → AppStack)
    // pour trouver la route RecipeDetail définie dans AppStack.
    navigation.navigate('RecipeDetail', { recipe: data });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Retour"
          hitSlop={8}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Recette IA
        </Text>
        <View style={{ minWidth: 36, alignItems: 'flex-end' }}>
          <AIQuotaBadge userId={user?.id} usageType="user" compact />
        </View>
      </View>

      {status === 'loading' ? (
        <View style={styles.center}>
          <Text style={styles.loadingEmoji}>✨</Text>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>
            {LOADING_MESSAGES[loadingMsgIdx]}
          </Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>Génération impossible</Text>
          <Text style={styles.errorMsg}>{errorMsg}</Text>
          <Pressable
            onPress={run}
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>
                ✨ Créée par l'IA depuis ton frigo
              </Text>
            </View>

            <Text style={styles.title}>{recipe.title}</Text>
            {recipe.description ? (
              <Text style={styles.description}>{recipe.description}</Text>
            ) : null}

            <View style={styles.chipsRow}>
              {recipe.duration ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>⏱️ {recipe.duration} min</Text>
                </View>
              ) : null}
              {recipe.servings ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    👥 {recipe.servings} pers.
                  </Text>
                </View>
              ) : null}
              {recipe.cooking_type ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>🔥 {recipe.cooking_type}</Text>
                </View>
              ) : null}
              {recipe.cuisine ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {getCountryFlag(recipe.cuisine)} {recipe.cuisine}
                  </Text>
                </View>
              ) : null}
              {recipe.dish_type ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {DISH_EMOJI[recipe.dish_type] || '🍽️'} {recipe.dish_type}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Ingrédients</Text>
            <View style={styles.pillsWrap}>
              {(recipe.ingredients || []).map((ing, idx) => (
                <View
                  key={`${ing.name}-${idx}`}
                  style={[
                    styles.pill,
                    ing.in_fridge ? styles.pillInFridge : styles.pillMissing,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      ing.in_fridge
                        ? styles.pillTextInFridge
                        : styles.pillTextMissing,
                    ]}
                  >
                    {ing.in_fridge ? '✓' : '⚠'} {formatIngredient(ing)}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Étapes</Text>
            {(recipe.steps || []).map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepCircle}>
                  <Text style={styles.stepNum}>{idx + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.stickyActions}>
            <Pressable
              onPress={onSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveBtn,
                (saving || pressed) && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'Enregistrement...' : '💾 Enregistrer dans Mes Recettes'}
              </Text>
            </Pressable>
            <Pressable
              onPress={run}
              disabled={saving}
              style={({ pressed }) => [
                styles.regenBtn,
                pressed && { opacity: 0.85 },
                saving && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.regenBtnText}>🔄 Générer une autre</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: spacing.sm,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backChevron: {
      fontSize: 24,
      lineHeight: 24,
      color: colors.text,
      marginTop: -2,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
      textAlign: 'center',
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: spacing.md,
    },
    loadingEmoji: { fontSize: 48, marginBottom: 8 },
    loadingText: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
      fontStyle: 'italic',
    },
    errorEmoji: { fontSize: 40, marginBottom: 4 },
    errorTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    errorMsg: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 4,
    },
    retryBtn: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 12,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    content: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 20,
      maxWidth: maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },

    aiBadge: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(155, 89, 182, 0.15)',
      borderWidth: 0.5,
      borderColor: 'rgba(155, 89, 182, 0.5)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      marginBottom: spacing.sm,
    },
    aiBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#C393E0',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
      textAlign: 'left',
    },
    description: {
      fontSize: 14,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 6,
      lineHeight: 20,
    },

    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: spacing.md,
    },
    chip: {
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },

    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.primary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },

    pillsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    pill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 0.5,
    },
    pillInFridge: {
      backgroundColor: 'rgba(74, 222, 128, 0.15)',
      borderColor: 'rgba(74, 222, 128, 0.5)',
    },
    pillMissing: {
      backgroundColor: '#FFF0E8',
      borderColor: 'rgba(255, 107, 53, 0.4)',
    },
    pillText: { fontSize: 12, fontWeight: '600' },
    pillTextInFridge: { color: '#3F9F5C' },
    pillTextMissing: { color: '#B35020' },

    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    stepNum: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    stepText: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },

    stickyActions: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 16,
      gap: 8,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    regenBtn: {
      borderRadius: 14,
      minHeight: 48,
      borderWidth: 0.5,
      borderColor: colors.primary,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    regenBtnText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
  });
