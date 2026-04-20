import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { deductRecipeFromFridge } from '../lib/fridgeDeduction';
import { spacing, radius, maxContentWidth } from '../theme/theme';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function confirmDialog(title, message, destructive = false) {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      {
        text: destructive ? 'Supprimer' : 'Confirmer',
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

function getMondayOfCurrentWeek() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const offset = (today.getDay() + 6) % 7; // lundi = 0, dimanche = 6
  const monday = new Date(today);
  monday.setDate(today.getDate() - offset);
  return monday;
}

function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts = { day: 'numeric', month: 'long' };
  return `${monday.toLocaleDateString('fr-FR', opts)} — ${sunday.toLocaleDateString('fr-FR', opts)}`;
}

function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesFridgeItem(ingName, fridgeItemName) {
  const a = normalizeName(ingName);
  const b = normalizeName(fridgeItemName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export default function PlanningScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [weekOffset, setWeekOffset] = useState(0);
  const [plannedMeals, setPlannedMeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const monday = useMemo(() => {
    const m = getMondayOfCurrentWeek();
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const loadMeals = useCallback(async () => {
    if (!user) {
      setPlannedMeals([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const startDate = monday.toISOString().split('T')[0];
    const end = new Date(monday);
    end.setDate(monday.getDate() + 6);
    const endDate = end.toISOString().split('T')[0];

    const { data } = await supabase
      .from('planned_meals')
      .select('*')
      .eq('user_id', user.id)
      .gte('planned_date', startDate)
      .lte('planned_date', endDate)
      .order('planned_date', { ascending: true })
      .order('created_at', { ascending: true });

    setPlannedMeals(data || []);
    setLoading(false);
  }, [user, monday]);

  useFocusEffect(
    useCallback(() => {
      loadMeals();
    }, [loadMeals])
  );

  const mealsByDay = useMemo(() => {
    return DAYS.map((dayName, index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      const dateISO = d.toISOString().split('T')[0];
      const meals = plannedMeals.filter((m) => m.planned_date === dateISO);
      return { dayName, date: d, dateISO, meals };
    });
  }, [monday, plannedMeals]);

  const todayISO = new Date().toISOString().split('T')[0];

  const completeMeal = async (meal) => {
    // 1. Marquer la recette comme completed
    const { error: updateErr } = await supabase
      .from('planned_meals')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', meal.id);
    if (updateErr) {
      notify('Erreur', updateErr.message);
      return;
    }

    // 2. Déduire les ingrédients du frigo via la lib centralisée
    let deductedCount = 0;
    try {
      const recipe = meal.recipe_snapshot || {};
      const { deducted } = await deductRecipeFromFridge({
        recipe,
        userId: user.id,
      });
      deductedCount = deducted.length;
    } catch (err) {
      console.warn('[PlanningScreen] deduction failed:', err?.message);
      // On continue : le plat reste marqué comme fait même si la
      // déduction a partiellement échoué.
    }

    await loadMeals();

    notify(
      'Bon appétit ! 🍽️',
      deductedCount > 0
        ? `Recette marquée comme terminée. ${deductedCount} ingrédient${deductedCount > 1 ? 's' : ''} retiré${deductedCount > 1 ? 's' : ''} du frigo.`
        : 'Recette marquée comme terminée. Aucun ingrédient du frigo à déduire.'
    );
  };

  const handleComplete = async (meal) => {
    const ok = await confirmDialog(
      'Terminer cette recette',
      'Cela marquera la recette comme cuisinée et retirera les ingrédients correspondants de ton frigo. OK ?'
    );
    if (ok) completeMeal(meal);
  };

  const handleSkip = async (meal) => {
    const ok = await confirmDialog(
      'Retirer du planning',
      'La recette sera supprimée du planning, sans toucher au frigo.',
      true
    );
    if (!ok) return;
    const { error } = await supabase
      .from('planned_meals')
      .delete()
      .eq('id', meal.id);
    if (error) {
      notify('Erreur', error.message);
      return;
    }
    await loadMeals();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.weekHeader}>
        <Pressable
          onPress={() => setWeekOffset((w) => w - 1)}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityLabel="Semaine précédente"
        >
          <Text style={[styles.weekArrow, { color: colors.text }]}>‹</Text>
        </Pressable>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={[styles.weekTitle, { color: colors.text }]}>📅 Planning</Text>
          <Text style={[styles.weekRange, { color: colors.textSecondary }]}>
            {formatWeekRange(monday)}
          </Text>
        </View>
        <Pressable
          onPress={() => setWeekOffset((w) => w + 1)}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityLabel="Semaine suivante"
        >
          <Text style={[styles.weekArrow, { color: colors.text }]}>›</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {mealsByDay.map(({ dayName, date, dateISO, meals }) => {
            const isToday = dateISO === todayISO;
            return (
              <View
                key={dateISO}
                style={[
                  styles.dayCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isToday ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={styles.dayHeader}>
                  <Text
                    style={[
                      styles.dayName,
                      { color: isToday ? colors.primary : colors.text },
                    ]}
                  >
                    {dayName}
                    {isToday ? (
                      <Text style={[styles.todayTag, { color: colors.primary }]}>
                        {'  ·  aujourd\'hui'}
                      </Text>
                    ) : null}
                  </Text>
                  <Text style={[styles.dayDate, { color: colors.textSecondary }]}>
                    {date.getDate()}/{date.getMonth() + 1}
                  </Text>
                </View>

                {meals.length === 0 ? (
                  <Text style={[styles.emptyDay, { color: colors.textSecondary }]}>
                    Rien de prévu. Assigne une recette depuis « Mes recettes » ou Studio IA.
                  </Text>
                ) : (
                  meals.map((meal) => {
                    const r = meal.recipe_snapshot || {};
                    const isCompleted = !!meal.completed_at;
                    return (
                      <View
                        key={meal.id}
                        style={[
                          styles.mealCard,
                          { backgroundColor: colors.background },
                          isCompleted && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={[styles.mealName, { color: colors.text }]} numberOfLines={2}>
                          {r.name || 'Recette'}
                        </Text>
                        <Text style={[styles.mealMeta, { color: colors.textSecondary }]}>
                          {r.time ? `⏱️ ${r.time}` : ''}
                          {r.time && r.servings ? '  ·  ' : ''}
                          {r.servings ? `👥 ${r.servings} pers.` : ''}
                        </Text>

                        {isCompleted ? (
                          <View style={styles.completedBadge}>
                            <Text style={styles.completedText}>✓ Cuisiné</Text>
                          </View>
                        ) : (
                          <View style={styles.mealActions}>
                            <Pressable
                              onPress={() => handleComplete(meal)}
                              style={({ pressed }) => [
                                styles.btnComplete,
                                { backgroundColor: colors.primary },
                                pressed && { opacity: 0.85 },
                              ]}
                            >
                              <Text style={styles.btnCompleteText}>✓ Terminer</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleSkip(meal)}
                              style={({ pressed }) => [
                                styles.btnSkip,
                                { borderColor: colors.border },
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <Text
                                style={[styles.btnSkipText, { color: colors.text }]}
                              >
                                Retirer
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },

    weekHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    weekArrow: {
      fontSize: 28,
      fontWeight: '600',
      padding: 8,
      lineHeight: 32,
    },
    weekTitle: {
      fontSize: 22,
      fontWeight: '700',
    },
    weekRange: {
      fontSize: 13,
      marginTop: 2,
    },

    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    listContent: {
      maxWidth: maxContentWidth,
      width: '100%',
      alignSelf: 'center',
      paddingBottom: 120,
    },

    dayCard: {
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    dayName: {
      fontSize: 15,
      fontWeight: '700',
    },
    todayTag: {
      fontSize: 13,
      fontWeight: '500',
    },
    dayDate: {
      fontSize: 12,
      fontWeight: '600',
    },
    emptyDay: {
      fontSize: 12,
      fontStyle: 'italic',
      marginTop: 4,
    },

    mealCard: {
      padding: 12,
      borderRadius: 12,
      marginTop: 6,
    },
    mealName: {
      fontSize: 14,
      fontWeight: '700',
    },
    mealMeta: {
      fontSize: 12,
      marginTop: 2,
      marginBottom: 10,
    },
    mealActions: {
      flexDirection: 'row',
      gap: 8,
    },
    btnComplete: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnCompleteText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    btnSkip: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnSkipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    completedBadge: {
      backgroundColor: 'rgba(74, 222, 128, 0.15)',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      alignSelf: 'flex-start',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(74, 222, 128, 0.5)',
    },
    completedText: {
      color: '#3F9F5C',
      fontSize: 12,
      fontWeight: '700',
    },
  });
