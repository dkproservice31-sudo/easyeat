import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { generateMisePlace } from '../lib/ai';
import { AIQuotaExceededError } from '../lib/aiQuota';
import { markRecipeAsCooked } from '../lib/fridgeDeduction';
import StepTimer from '../components/StepTimer';
import RatingModal from '../components/RatingModal';
import { spacing, maxContentWidth } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

// Helper : extrait la durée en minutes d'une étape de cuisson si elle
// est stockée dans mise_en_place.step_durations. Rétrocompatible avec
// les recettes anciennes (schema_version absent) : renvoie null.
function getStepDuration(misePlace, cookingStepIndex) {
  if (!misePlace || !Array.isArray(misePlace.step_durations)) return null;
  const found = misePlace.step_durations.find(
    (s) => s && s.step_index === cookingStepIndex
  );
  const m = found?.minutes;
  if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0) return null;
  return m;
}

// Parse un bloc texte multi-lignes numéroté en array de steps.
// Copie de la logique de components/StepsList.js (parseSteps non exporté).
function parseStepsText(raw) {
  if (!raw) return [];
  const markerRe = /(\d+)\s*[\.\)\-:]\s+/g;
  const matches = [];
  let m;
  while ((m = markerRe.exec(raw)) !== null) {
    matches.push({ num: parseInt(m[1], 10), index: m.index, length: m[0].length });
  }
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
  if (seq.length === 1) {
    const start = seq[0].index + seq[0].length;
    const only = raw.slice(start).trim();
    if (only) return [only];
  }
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\d+\s*[\.\)\-:]\s*/, '').trim())
    .filter(Boolean);
}

export default function CookingModeScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialRecipe = route.params?.recipe || null;
  const recipeId = route.params?.recipeId || initialRecipe?.id || null;

  const [recipe, setRecipe] = useState(initialRecipe);
  const [loading, setLoading] = useState(!initialRecipe);
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [checkedTasks, setCheckedTasks] = useState(new Set());
  const [ratingVisible, setRatingVisible] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Charge la recette complète si on a juste l'ID (ou pour rafraîchir mise_en_place)
  useEffect(() => {
    if (!recipeId) return;
    if (initialRecipe && initialRecipe.mise_en_place) {
      // Déjà tout ce qu'il faut
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', recipeId)
        .maybeSingle();
      if (!cancelled && data) setRecipe(data);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  // Génère la mise en place si pas déjà en cache DB
  useEffect(() => {
    if (!recipe || !recipe.id) return;
    if (recipe.mise_en_place && Array.isArray(recipe.mise_en_place.tasks)) return;
    let cancelled = false;
    (async () => {
      setGenerating(true);
      try {
        const result = await generateMisePlace({ recipe, userId: user?.id });
        const newMisePlace = {
          tasks: result.tasks,
          step_durations: Array.isArray(result.step_durations)
            ? result.step_durations
            : [],
          generated_at: new Date().toISOString(),
          schema_version: 2,
        };
        const { error } = await supabase
          .from('recipes')
          .update({ mise_en_place: newMisePlace })
          .eq('id', recipe.id);
        if (cancelled) return;
        if (error) {
          // Affiche quand même à l'écran, juste pas persisté
          console.warn('[CookingMode] cache save failed:', error.message);
        }
        setRecipe((prev) =>
          prev ? { ...prev, mise_en_place: newMisePlace } : prev
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AIQuotaExceededError) {
          notify(
            'Limite IA atteinte',
            "Tu as utilisé tes 20 générations IA aujourd'hui. Reviens demain !"
          );
        } else {
          notify(
            'IA Chef indisponible',
            err?.message || 'Impossible de générer la mise en place. Tu peux continuer sans.'
          );
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipe?.id, recipe?.mise_en_place]);

  // Wake Lock : garde l'écran allumé tant qu'on est en mode cuisine.
  // Silencieux si API non dispo (Expo natif, anciens navigateurs).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.wakeLock) {
      return undefined;
    }
    let wakeLockSentinel = null;
    let cancelled = false;

    const acquireLock = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockSentinel = lock;
        // Re-acquérir automatiquement si relâché par le navigateur
        // (changement de visibilité, etc.)
        lock.addEventListener('release', () => {
          if (!cancelled) acquireLock();
        });
      } catch (err) {
        // iOS en browser non-standalone, permission refusée, etc.
        console.warn('[CookingMode] Wake Lock request failed:', err?.message);
      }
    };

    const handleVisibility = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        !cancelled &&
        !wakeLockSentinel
      ) {
        acquireLock();
      }
    };

    acquireLock();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      cancelled = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
    };
  }, []);

  const cookingSteps = useMemo(
    () => parseStepsText(recipe?.steps || ''),
    [recipe?.steps]
  );
  const misePlaceTasks = Array.isArray(recipe?.mise_en_place?.tasks)
    ? recipe.mise_en_place.tasks
    : [];

  const totalSteps = 1 + cookingSteps.length; // 1 pour la mise en place + n étapes
  const isMisePlaceStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const cookingStepIndex = currentStep - 1;

  const toggleTask = (taskId) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) setCurrentStep((s) => s + 1);
  }, [currentStep, totalSteps]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  const handleExit = useCallback(() => {
    const confirmMsg =
      'Tu perdras ta progression actuelle.\n\nQuitter le mode cuisine ?';
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) navigation.goBack();
      return;
    }
    Alert.alert('Quitter le mode cuisine ?', 'Tu perdras ta progression actuelle.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }, [navigation]);

  const handleFinish = useCallback(() => {
    setRatingVisible(true);
  }, []);

  const finalizeCooking = useCallback(
    async (rating) => {
      setRatingVisible(false);
      if (!recipe || !user) {
        navigation.goBack();
        return;
      }
      setProcessing(true);
      try {
        const { deducted, skipped } = await markRecipeAsCooked({
          recipe,
          userId: user.id,
          rating: typeof rating === 'number' ? rating : null,
        });

        let message = '';
        if (deducted.length > 0) {
          message = `${deducted.length} ingrédient${deducted.length > 1 ? 's' : ''} retiré${deducted.length > 1 ? 's' : ''} du frigo.`;
        } else if (skipped.length > 0) {
          message =
            'Aucun ingrédient matché dans ton frigo (déjà consommés ou noms différents).';
        } else {
          message = 'Recette marquée comme cuisinée.';
        }
        if (typeof rating === 'number') {
          message += ` Note ${rating}/5 enregistrée.`;
        }

        notify('🍽️ Bon appétit !', message);
      } catch (err) {
        notify(
          'Erreur',
          err?.message ||
            "Problème lors de la finalisation. Ta recette a peut-être été marquée mais le frigo n'a pas été mis à jour."
        );
      } finally {
        setProcessing(false);
        navigation.goBack();
      }
    },
    [recipe, user, navigation]
  );

  if (loading || !recipe) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={styles.centerLoader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const progressPct = Math.round(((currentStep + 1) / totalSteps) * 100);

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <Pressable
          onPress={handleExit}
          hitSlop={10}
          accessibilityLabel="Quitter le mode cuisine"
          style={({ pressed }) => pressed && { opacity: 0.5 }}
        >
          <Text style={[styles.exitBtn, { color: colors.text }]}>×</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text
            style={[styles.recipeName, { color: colors.text }]}
            numberOfLines={1}
          >
            {recipe.title}
          </Text>
          <Text style={[styles.stepIndicator, { color: colors.textSecondary }]}>
            Étape {currentStep + 1} / {totalSteps}
          </Text>
        </View>
        <View style={styles.headerRightSpacer} />
      </View>

      <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: colors.primary,
              width: `${progressPct}%`,
            },
          ]}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isMisePlaceStep ? (
          <View>
            <Text style={[styles.stepTitle, { color: colors.primary }]}>
              🔪 Mise en place
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              Prépare tout ça avant de commencer la cuisson
            </Text>

            {generating ? (
              <View style={styles.centerBlock}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                  L'IA Chef analyse ta recette...
                </Text>
              </View>
            ) : misePlaceTasks.length === 0 ? (
              <View style={styles.centerBlock}>
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Mise en place non disponible. Passe à la suite.
                </Text>
              </View>
            ) : (
              <>
                {misePlaceTasks.map((task) => {
                  const isChecked = checkedTasks.has(task.id);
                  return (
                    <Pressable
                      key={task.id}
                      onPress={() => toggleTask(task.id)}
                      style={({ pressed }) => [
                        styles.taskRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                        isChecked && {
                          backgroundColor: 'rgba(74, 222, 128, 0.1)',
                          borderColor: '#4ADE80',
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isChecked }}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          { borderColor: colors.border },
                          isChecked && {
                            backgroundColor: '#4ADE80',
                            borderColor: '#4ADE80',
                          },
                        ]}
                      >
                        {isChecked ? (
                          <Text style={styles.checkmark}>✓</Text>
                        ) : null}
                      </View>
                      <Text style={styles.taskEmoji}>{task.emoji}</Text>
                      <Text
                        style={[
                          styles.taskDescription,
                          { color: colors.text },
                          isChecked && {
                            textDecorationLine: 'line-through',
                            opacity: 0.6,
                          },
                        ]}
                      >
                        {task.description}
                      </Text>
                    </Pressable>
                  );
                })}
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  💡 Coche chaque tâche au fur et à mesure
                </Text>
              </>
            )}
          </View>
        ) : (
          <View>
            <Text style={[styles.stepTitle, { color: colors.primary }]}>
              Étape {cookingStepIndex + 1}
            </Text>
            <Text style={[styles.cookingStepText, { color: colors.text }]}>
              {cookingSteps[cookingStepIndex] || ''}
            </Text>
            {(() => {
              const duration = getStepDuration(
                recipe?.mise_en_place,
                cookingStepIndex
              );
              if (!duration) return null;
              return (
                <StepTimer
                  minutes={duration}
                  stepKey={`${recipe?.id}-${cookingStepIndex}`}
                />
              );
            })()}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={handlePrev}
          disabled={currentStep === 0}
          style={({ pressed }) => [
            styles.btnPrev,
            { borderColor: colors.border },
            currentStep === 0 && { opacity: 0.3 },
            pressed && currentStep > 0 && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.btnPrevText, { color: colors.text }]}>
            ‹ Précédent
          </Text>
        </Pressable>

        {isLastStep ? (
          <Pressable
            onPress={handleFinish}
            style={({ pressed }) => [
              styles.btnFinish,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.btnFinishText}>✓ Terminer la cuisine</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.btnNext,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.btnNextText}>Suivant ›</Text>
          </Pressable>
        )}
      </View>

      <RatingModal
        visible={ratingVisible}
        recipeName={recipe?.title || ''}
        onClose={() => setRatingVisible(false)}
        onSubmit={(r) => finalizeCooking(r)}
        onSkip={() => finalizeCooking(null)}
      />

      {processing ? (
        <View style={styles.processingOverlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.processingText, { color: colors.text }]}>
            Mise à jour du frigo...
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    centerLoader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    exitBtn: {
      fontSize: 32,
      fontWeight: '300',
      width: 30,
      textAlign: 'left',
      lineHeight: 34,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerRightSpacer: {
      width: 30,
    },
    recipeName: {
      fontSize: 16,
      fontWeight: '700',
    },
    stepIndicator: {
      fontSize: 12,
      marginTop: 2,
    },
    progressBarBg: {
      height: 4,
      marginHorizontal: 16,
      borderRadius: 2,
      marginBottom: 16,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
      maxWidth: maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
    stepTitle: {
      fontSize: 28,
      fontWeight: '700',
      marginBottom: 6,
    },
    stepSubtitle: {
      fontSize: 14,
      marginBottom: 20,
    },
    centerBlock: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    centerText: {
      fontSize: 14,
      marginTop: 12,
      fontStyle: 'italic',
    },
    emptyHint: {
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 8,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkmark: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 16,
    },
    taskEmoji: {
      fontSize: 22,
    },
    taskDescription: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
    },
    hint: {
      fontSize: 12,
      textAlign: 'center',
      marginTop: 20,
      fontStyle: 'italic',
    },
    cookingStepText: {
      fontSize: 18,
      lineHeight: 28,
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    btnPrev: {
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrevText: {
      fontSize: 14,
      fontWeight: '600',
    },
    btnNext: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnNextText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    btnFinish: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4ADE80',
    },
    btnFinishText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    processingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    processingText: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
