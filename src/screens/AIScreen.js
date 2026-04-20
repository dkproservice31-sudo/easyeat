import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import ServingsSelector from '../components/ServingsSelector';
import RecipePreview from '../components/RecipePreview';
import AIQuotaBadge from '../components/AIQuotaBadge';
import QuotaWarningBanner from '../components/QuotaWarningBanner';
import InfoButton from '../components/InfoButton';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { generateRecipe } from '../lib/ai';
import { AIQuotaExceededError, fetchAIQuota } from '../lib/aiQuota';
import { spacing } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function AIScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [servings, setServings] = useState('4');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [quotaRemaining, setQuotaRemaining] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      fetchAIQuota(user.id, 'user').then((q) => {
        if (!cancelled) setQuotaRemaining(q.remaining);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const quotaExhausted = quotaRemaining === 0;
  const canGenerate =
    !!prompt.trim() && !!servings && !generating && !quotaExhausted;

  const onGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setRecipe(null);
    try {
      const result = await generateRecipe({
        servings: parseInt(servings, 10),
        prompt,
        userId: user?.id,
      });
      if (result.cooking_temp === 0) result.cooking_temp = null;
      setRecipe(result);
      // Refresh quota après succès
      fetchAIQuota(user.id, 'user').then((q) => setQuotaRemaining(q.remaining));
    } catch (err) {
      if (err instanceof AIQuotaExceededError) {
        setQuotaRemaining(0);
        notify(
          'Limite IA atteinte',
          'Tu as utilisé tes 20 générations IA aujourd\'hui. Le compteur se remet à zéro à minuit.'
        );
      } else {
        notify('Génération impossible', err.message || 'Erreur inconnue');
      }
    } finally {
      setGenerating(false);
    }
  };

  const onSave = async () => {
    if (!recipe || !user) return;
    setSaving(true);
    const { error } = await supabase.from('recipes').insert({
      user_id: user.id,
      title: recipe.title,
      description: recipe.description || null,
      ingredients: recipe.ingredients || null,
      steps: recipe.steps || null,
      servings: parseInt(servings, 10),
      duration: recipe.duration || null,
      cooking_temp: recipe.cooking_temp || null,
      cooking_type: recipe.cooking_type || null,
      fat_type: recipe.fat_type || null,
      dish_type: recipe.dish_type || 'tout',
      generated_by_ai: true,
    });

    setSaving(false);
    if (error) return notify('Enregistrement impossible', error.message);
    notify('Enregistrée !', 'Recette ajoutée à tes recettes.');
    setRecipe(null);
    setPrompt('');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.heroEmoji}>✨</Text>
        <Text style={styles.heroTitle}>Studio IA</Text>
        <Text style={styles.heroSubtitle}>
          Génère la recette de tes envies
        </Text>
        <View style={{ marginTop: 8 }}>
          <AIQuotaBadge userId={user?.id} usageType="user" />
        </View>
      </View>

      <View style={styles.featureCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🍳</Text>
          <Text style={styles.cardTitle}>Générer une recette</Text>
          <InfoButton
            title="Générer une recette"
            description="Génère une recette unique et instantanée basée sur ce que tu as dans ton frigo. Idéale quand tu veux cuisiner maintenant. L'IA te propose 1 recette optimisée pour utiliser tes ingrédients disponibles."
          />
        </View>

        <Text style={styles.label}>Nombre de personnes</Text>
        <ServingsSelector
          value={servings}
          onChange={setServings}
          disabled={generating}
        />

        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.label}>Ton envie</Text>
          <Input
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Ex: un gâteau au chocolat moelleux, une recette italienne rapide, des tapas faciles..."
            multiline
            numberOfLines={3}
            style={styles.multiline}
            editable={!generating}
            maxLength={200}
          />
        </View>

        <QuotaWarningBanner remaining={quotaRemaining} />

        <View style={{ marginTop: spacing.lg }}>
          <Button
            title={
              quotaExhausted
                ? 'Quota atteint · Reviens demain'
                : generating
                ? 'Génération...'
                : '✨ Générer avec l\'IA'
            }
            onPress={onGenerate}
            loading={generating}
            disabled={!canGenerate}
          />
        </View>

        {recipe && (
          <>
            <RecipePreview recipe={recipe} />
            <View style={{ marginTop: spacing.md }}>
              <Button
                title="💾 Enregistrer dans Mes Recettes"
                onPress={onSave}
                loading={saving}
                disabled={generating}
              />
              <View style={{ height: spacing.sm }} />
              <Button
                title="🔄 Régénérer"
                variant="ghost"
                onPress={onGenerate}
                disabled={generating || saving}
              />
            </View>
          </>
        )}
      </View>

      <Pressable
        onPress={() => navigation.navigate('WeeklyMenu')}
        style={({ pressed }) => [
          styles.featureCard,
          styles.featureCardCta,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Planifier ma semaine"
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📅</Text>
          <Text style={styles.cardTitle}>Planifier ma semaine</Text>
          <InfoButton
            title="Planifier ma semaine"
            description="Génère un plan de repas pour les 7 prochains jours. L'IA priorise les ingrédients qui périment bientôt pour t'aider à moins gaspiller. Parfait pour préparer tes courses du dimanche et ne plus te demander 'qu'est-ce qu'on mange ce soir ?' tous les jours."
          />
        </View>
        <View style={styles.cardCtaRow}>
          <Text style={styles.cardDescription}>
            7 recettes pour toute la semaine
          </Text>
          <Text style={styles.cardChevron}>›</Text>
        </View>
      </Pressable>

      <Text style={styles.aiDisclaimer}>
        ⓘ Notre IA peut se tromper. Vérifie toujours les informations importantes.
      </Text>
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 6,
    ...(Platform.OS === 'web'
      ? {
          fontFamily:
            '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif',
        }
      : null),
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },

  label: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  multiline: {
    minHeight: 100,
    padding: 14,
    paddingTop: 14,
    fontSize: 16,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: spacing.md,
  },
  featureCardCta: {
    borderColor: colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  cardEmoji: {
    fontSize: 22,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardDescription: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  cardChevron: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
  },
  aiDisclaimer: {
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: spacing.lg,
  },
});
