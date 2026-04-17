import React, { useEffect, useMemo, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { generateWeeklyMenu } from '../../lib/ai';
import { spacing, maxContentWidth } from '../../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const LOADING_MESSAGES = [
  'Notre IA planifie ta semaine...',
  'Varie les saveurs...',
  'Équilibre les apports...',
  'Vérifie la faisabilité...',
];

const MEALS_OPTIONS = [
  { value: 1, label: '1 repas' },
  { value: 2, label: '2 repas' },
];

const DIET_OPTIONS = [
  { value: 'aucune', label: 'Aucun' },
  { value: 'végétarien', label: 'Végé' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'sans gluten', label: 'Sans gluten' },
];

const VARIETY_OPTIONS = [
  { value: 'classique', label: 'Classique' },
  { value: 'varié', label: 'Varié' },
  { value: 'aventurier', label: 'Aventurier' },
];

function Chips({ options, value, onChange, disabled, styles, colors }) {
  return (
    <View style={styles.chipsRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.chip,
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
              pressed && !disabled && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                active && { color: '#FFFFFF' },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MealCard({ label, meal, styles, colors }) {
  if (!meal) {
    return (
      <View style={[styles.mealCard, { opacity: 0.5 }]}>
        <Text style={styles.mealLabel}>{label}</Text>
        <Text style={styles.mealTitle}>—</Text>
      </View>
    );
  }
  return (
    <View style={styles.mealCard}>
      <Text style={styles.mealLabel}>{label}</Text>
      <Text style={styles.mealTitle} numberOfLines={2}>
        {meal.title || 'Sans titre'}
      </Text>
      {meal.description ? (
        <Text style={styles.mealDesc} numberOfLines={3}>
          {meal.description}
        </Text>
      ) : null}
      <View style={styles.mealFooter}>
        {meal.duration ? (
          <Text style={styles.mealDuration}>⏱️ {meal.duration} min</Text>
        ) : (
          <View />
        )}
        <Pressable
          disabled
          style={[styles.viewRecipeBtn, { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
        >
          <Text style={[styles.viewRecipeText, { color: colors.textSecondary }]}>
            Voir (bientôt)
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function WeeklyMenuScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // 'config' | 'loading' | 'success' | 'error'
  const [status, setStatus] = useState('config');
  const [mealsPerDay, setMealsPerDay] = useState(2);
  const [dietPreference, setDietPreference] = useState('aucune');
  const [varietyLevel, setVarietyLevel] = useState('varié');
  const [avoidIngredients, setAvoidIngredients] = useState('');
  const [menu, setMenu] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [saving, setSaving] = useState(false);

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
    setMenu(null);
    setErrorMsg('');
    setLoadingMsgIdx(0);
    try {
      const { data: fridgeData } = await supabase
        .from('fridge_items')
        .select('name, quantity, unit')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const fridge = fridgeData ?? [];

      const result = await generateWeeklyMenu(fridge, {
        mealsPerDay,
        dietPreference,
        varietyLevel,
        avoidIngredients: avoidIngredients.trim(),
      });
      setMenu(result);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err?.message || 'Une erreur est survenue. Réessayez.');
      setStatus('error');
    }
  };

  const onSave = async () => {
    if (!menu || !user) return;
    setSaving(true);
    const { error } = await supabase.from('weekly_menus').insert({
      user_id: user.id,
      title: menu.title,
      meals: menu.meals,
      generated_by_ai: true,
    });
    setSaving(false);
    if (error) {
      notify('Enregistrement impossible', error.message);
      return;
    }
    notify('Menu enregistré !', 'Tu pourras le retrouver bientôt.');
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
          Menu de la semaine
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {status === 'config' ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.bigTitle}>Crée ton menu</Text>
          <Text style={styles.bigSubtitle}>
            Ajuste tes préférences, notre IA fait le reste.
          </Text>

          <Text style={styles.fieldLabel}>Repas par jour</Text>
          <Chips
            options={MEALS_OPTIONS}
            value={mealsPerDay}
            onChange={setMealsPerDay}
            styles={styles}
            colors={colors}
          />

          <Text style={styles.fieldLabel}>Régime</Text>
          <Chips
            options={DIET_OPTIONS}
            value={dietPreference}
            onChange={setDietPreference}
            styles={styles}
            colors={colors}
          />

          <Text style={styles.fieldLabel}>Variété</Text>
          <Chips
            options={VARIETY_OPTIONS}
            value={varietyLevel}
            onChange={setVarietyLevel}
            styles={styles}
            colors={colors}
          />

          <Text style={styles.fieldLabel}>À éviter (optionnel)</Text>
          <TextInput
            value={avoidIngredients}
            onChangeText={setAvoidIngredients}
            placeholder="Ex: champignons, coriandre..."
            placeholderTextColor={colors.textHint}
            style={styles.input}
            maxLength={200}
          />

          <Pressable
            onPress={run}
            style={({ pressed }) => [
              styles.generateBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.generateBtnText}>✨ Générer ma semaine</Text>
          </Pressable>
        </ScrollView>
      ) : status === 'loading' ? (
        <View style={styles.center}>
          <Text style={styles.loadingEmoji}>📅</Text>
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
          <Pressable
            onPress={() => setStatus('config')}
            style={({ pressed }) => [
              styles.backToConfigBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.backToConfigText, { color: colors.primary }]}>
              Modifier mes préférences
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.menuTitle}>{menu?.title}</Text>
            <Text style={styles.menuSubtitle}>
              {mealsPerDay === 1
                ? '7 dîners pour ta semaine'
                : '7 jours · 14 repas'}
            </Text>

            {(menu?.meals || []).map((day) => (
              <View key={day.day} style={styles.dayBlock}>
                <Text style={styles.dayTitle}>{day.day}</Text>
                {mealsPerDay === 2 ? (
                  <MealCard
                    label="Déjeuner"
                    meal={day.lunch}
                    styles={styles}
                    colors={colors}
                  />
                ) : null}
                <MealCard
                  label="Dîner"
                  meal={day.dinner}
                  styles={styles}
                  colors={colors}
                />
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
                {saving ? 'Enregistrement...' : '💾 Enregistrer mon menu'}
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
              <Text style={[styles.regenBtnText, { color: colors.primary }]}>
                🔄 Regénérer
              </Text>
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

    content: {
      paddingHorizontal: 16,
      paddingBottom: 20,
      maxWidth: maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },

    bigTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginTop: 4,
    },
    bigSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: spacing.lg,
    },

    fieldLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginTop: spacing.md,
      marginBottom: 8,
    },

    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 0.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },

    input: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.text,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
    },

    generateBtn: {
      marginTop: spacing.lg,
      backgroundColor: colors.primary,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    generateBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
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
    backToConfigBtn: {
      marginTop: spacing.sm,
      padding: 10,
    },
    backToConfigText: {
      fontSize: 13,
      fontWeight: '700',
    },

    menuTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.primary,
      marginTop: 4,
    },
    menuSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      marginBottom: spacing.md,
    },

    dayBlock: {
      marginBottom: spacing.md,
    },
    dayTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      textTransform: 'capitalize',
      marginBottom: 6,
    },
    mealCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    mealLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    mealTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginTop: 4,
    },
    mealDesc: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 18,
    },
    mealFooter: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    mealDuration: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    viewRecipeBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    viewRecipeText: {
      fontSize: 11,
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
      fontSize: 14,
      fontWeight: '700',
    },
  });
