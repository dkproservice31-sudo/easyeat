import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { generateWeeklyMenu } from '../lib/ai';
import { AIQuotaExceededError } from '../lib/aiQuota';
import { spacing, maxContentWidth } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function getMondayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7; // lundi = 0, dimanche = 6
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
}

function formatFrenchDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

function LoadingView({ colors }) {
  const MESSAGES = [
    'Notre IA planifie ta semaine...',
    'Varie les saveurs...',
    'Priorise les ingrédients urgents...',
    'Vérifie la faisabilité...',
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const it = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 2000);
    return () => clearInterval(it);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: spacing.md }}>
      <Text style={{ fontSize: 48 }}>📅</Text>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={{ fontSize: 15, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>
        {MESSAGES[idx]}
      </Text>
    </View>
  );
}

function RecipeDetailModal({ visible, day, recipe, onClose, styles, colors }) {
  if (!recipe) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.detailOverlay}>
        <Pressable style={styles.detailBackdrop} onPress={onClose} />
        <View style={styles.detailCard}>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.detailDay}>{day}</Text>
            <Text style={styles.detailName}>{recipe.name}</Text>

            <View style={styles.detailChipsRow}>
              {recipe.time ? (
                <View style={styles.detailChip}>
                  <Text style={styles.detailChipText}>⏱️ {recipe.time}</Text>
                </View>
              ) : null}
              {recipe.servings ? (
                <View style={styles.detailChip}>
                  <Text style={styles.detailChipText}>👥 {recipe.servings} pers.</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.detailSection}>Ingrédients</Text>
            <View style={styles.pillsWrap}>
              {(recipe.ingredients || []).map((ing, i) => (
                <View
                  key={`${ing.name}-${i}`}
                  style={[
                    styles.pill,
                    ing.in_fridge ? styles.pillInFridge : styles.pillMissing,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      ing.in_fridge ? styles.pillTextInFridge : styles.pillTextMissing,
                    ]}
                  >
                    {ing.in_fridge ? '✓' : '⚠'} {ing.name}
                    {ing.quantity != null ? ` · ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}` : ''}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.detailSection}>Étapes</Text>
            {(recipe.instructions || []).map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepCircle}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.detailCloseBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.detailCloseBtnText}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function WeeklyMenuScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [menu, setMenu] = useState(null);
  const [detailRecipe, setDetailRecipe] = useState(null);

  const loadCurrentMenu = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const mondayISO = getMondayISO();
    const { data } = await supabase
      .from('weekly_menus')
      .select('*')
      .eq('user_id', user.id)
      .gte('start_date', mondayISO)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    setMenu(data || null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadCurrentMenu();
  }, [loadCurrentMenu]);

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data: fridgeItems } = await supabase
        .from('fridge_items')
        .select('name, quantity, unit, expiration_date, shelf_life_days')
        .eq('user_id', user.id);

      if (!fridgeItems || fridgeItems.length === 0) {
        notify('Frigo vide', 'Ajoute des ingrédients avant de générer un menu.');
        setGenerating(false);
        return;
      }

      const { menu: newMenu, focusItems } = await generateWeeklyMenu({
        fridgeItems,
        userId: user.id,
      });

      const mondayISO = getMondayISO();
      const { data: saved, error } = await supabase
        .from('weekly_menus')
        .upsert(
          {
            user_id: user.id,
            start_date: mondayISO,
            days: newMenu,
            focus_items: focusItems || [],
          },
          { onConflict: 'user_id,start_date' }
        )
        .select()
        .single();

      if (error) {
        notify('Enregistrement impossible', error.message);
        return;
      }
      setMenu(saved);
    } catch (err) {
      if (err instanceof AIQuotaExceededError) {
        notify(
          'Limite IA atteinte',
          "Tu as utilisé tes 20 générations IA aujourd'hui. Reviens demain !"
        );
      } else {
        notify('Génération impossible', err?.message || 'Erreur inconnue.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const days = Array.isArray(menu?.days) ? menu.days : [];
  const focusItems = Array.isArray(menu?.focus_items) ? menu.focus_items : [];

  const weekLabel = useMemo(() => {
    if (!menu?.start_date) return '';
    const start = new Date(menu.start_date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `Semaine du ${formatFrenchDate(start.toISOString())} au ${formatFrenchDate(end.toISOString())}`;
  }, [menu?.start_date]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Retour"
          hitSlop={8}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Menu de la semaine
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : generating ? (
        <LoadingView colors={colors} />
      ) : !menu ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text style={styles.emptyTitle}>Aucun menu cette semaine</Text>
          <Text style={styles.emptySubtitle}>
            Génère 7 dîners adaptés à ton frigo en 1 clic.
            L'IA priorise les ingrédients qui périment bientôt.
          </Text>
          <Pressable
            onPress={handleGenerate}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.primaryBtnText}>✨ Générer mon menu</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.weekLabel}>{weekLabel}</Text>
            <Text style={styles.weekSubtitle}>7 dîners adaptés à ton frigo</Text>

            {focusItems.length > 0 ? (
              <View style={styles.focusBanner}>
                <Text style={styles.focusEmoji}>⚠️</Text>
                <Text style={styles.focusText}>
                  Priorisés (périment bientôt) : {focusItems.join(', ')}
                </Text>
              </View>
            ) : null}

            {days.map((d, i) => {
              const recipe = d.recipe || {};
              return (
                <Pressable
                  key={`${d.day}-${i}`}
                  onPress={() => setDetailRecipe(d)}
                  style={({ pressed }) => [
                    styles.dayCard,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.day} : ${recipe.name}`}
                >
                  <Text style={styles.dayName}>{d.day}</Text>
                  <Text style={styles.recipeName} numberOfLines={2}>
                    {recipe.name}
                  </Text>
                  <View style={styles.dayFooter}>
                    {recipe.time ? (
                      <Text style={styles.dayMeta}>⏱️ {recipe.time}</Text>
                    ) : null}
                    {recipe.servings ? (
                      <Text style={styles.dayMeta}>👥 {recipe.servings} pers.</Text>
                    ) : null}
                    <Text style={styles.dayChevron}>›</Text>
                  </View>
                </Pressable>
              );
            })}

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.stickyActions}>
            <Pressable
              onPress={handleGenerate}
              disabled={generating}
              style={({ pressed }) => [
                styles.regenBtn,
                { borderColor: colors.primary },
                pressed && { opacity: 0.85 },
                generating && { opacity: 0.5 },
              ]}
            >
              <Text style={[styles.regenBtnText, { color: colors.primary }]}>
                🔄 Régénérer le menu
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <RecipeDetailModal
        visible={!!detailRecipe}
        day={detailRecipe?.day}
        recipe={detailRecipe?.recipe}
        onClose={() => setDetailRecipe(null)}
        styles={styles}
        colors={colors}
      />
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

    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: spacing.md,
    },
    emptyEmoji: { fontSize: 54 },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 340,
    },
    primaryBtn: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 14,
      minHeight: 52,
      minWidth: 240,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },

    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 16,
      maxWidth: maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
    weekLabel: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.primary,
    },
    weekSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      marginBottom: spacing.md,
    },
    focusBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: 'rgba(255, 149, 0, 0.1)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#FF9500',
      marginBottom: spacing.md,
    },
    focusEmoji: { fontSize: 16 },
    focusText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: '#B35020',
      lineHeight: 16,
    },
    dayCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
    },
    dayName: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    recipeName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginTop: 4,
    },
    dayFooter: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    dayMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    dayChevron: {
      marginLeft: 'auto',
      fontSize: 22,
      color: colors.primary,
      fontWeight: '700',
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
    regenBtn: {
      borderRadius: 14,
      minHeight: 48,
      borderWidth: 0.5,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    regenBtnText: {
      fontSize: 14,
      fontWeight: '700',
    },

    // Detail modal
    detailOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    detailBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    detailCard: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 24,
      paddingHorizontal: 20,
      paddingBottom: 20,
      maxHeight: '88%',
    },
    detailDay: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    detailName: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.primary,
      marginTop: 4,
    },
    detailChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
    },
    detailChip: {
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    detailChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    detailSection: {
      fontSize: 16,
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
      backgroundColor: colors.primaryLight,
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
    detailCloseBtn: {
      marginTop: spacing.sm,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailCloseBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
  });
