import React, { useMemo, useState } from 'react';
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
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { generateRecipe } from '../lib/ai';
import { radius, spacing, touch, typography } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function Checkbox({ checked, onToggle, label, disabled, styles }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={({ pressed }) => [
        styles.checkRow,
        pressed && !disabled && { opacity: 0.85 },
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkboxTick}>✓</Text>}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

export default function AIScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [servings, setServings] = useState('2');
  const [prompt, setPrompt] = useState('');
  const [useFridge, setUseFridge] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState(null);

  const onGenerate = async () => {
    if (!servings) return notify('Oops', 'Choisissez un nombre de personnes.');
    setGenerating(true);
    setRecipe(null);
    try {
      let fridgeItems = [];
      if (useFridge && user) {
        const { data } = await supabase
          .from('fridge_items')
          .select('name, quantity, unit')
          .eq('user_id', user.id)
          .gt('quantity', 0);
        fridgeItems = data ?? [];
      }
      const result = await generateRecipe({
        servings: parseInt(servings, 10),
        prompt,
        fridgeItems,
      });
      // cooking_temp 0 = pas de cuisson four → null
      if (result.cooking_temp === 0) result.cooking_temp = null;
      setRecipe(result);
    } catch (err) {
      notify('Génération impossible', err.message || 'Erreur inconnue');
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
      generated_by_ai: true,
    });

    setSaving(false);
    if (error) return notify('Enregistrement impossible', error.message);
    notify('Enregistrée !', 'Recette ajoutée à vos recettes.');
    setRecipe(null);
    setPrompt('');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.heroEmoji}>✨</Text>
        <Text style={styles.heroTitle}>Studio IA</Text>
        <Text style={styles.heroSubtitle}>
          Notre IA génère votre recette sur mesure
        </Text>
      </View>

      <Text style={styles.label}>Nombre de personnes</Text>
      <ServingsSelector
        value={servings}
        onChange={setServings}
        disabled={generating}
      />

      <View style={{ marginTop: spacing.lg }}>
        <Text style={styles.label}>Votre envie</Text>
        <Input
          value={prompt}
          onChangeText={setPrompt}
          placeholder="une recette italienne avec des pâtes..."
          multiline
          numberOfLines={3}
          style={styles.multiline}
          editable={!generating}
          maxLength={500}
        />
      </View>

      <Checkbox
        checked={useFridge}
        onToggle={() => setUseFridge((v) => !v)}
        label="Utiliser les ingrédients de mon frigo"
        disabled={generating}
        styles={styles}
      />

      <View style={{ marginTop: spacing.lg }}>
        <Button
          title={generating ? 'Génération...' : 'Générer avec l\'IA'}
          onPress={onGenerate}
          loading={generating}
        />
      </View>

      {recipe && (
        <>
          <RecipePreview recipe={recipe} />
          <View style={{ marginTop: spacing.md }}>
            <Button
              title="Enregistrer dans mes recettes"
              onPress={onSave}
              loading={saving}
              disabled={generating}
            />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Regénérer"
              variant="ghost"
              onPress={onGenerate}
              disabled={generating || saving}
            />
          </View>
        </>
      )}
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
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: touch.minHeight,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkboxTick: { color: colors.surface, fontWeight: '700', fontSize: 14 },
  checkLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
});
