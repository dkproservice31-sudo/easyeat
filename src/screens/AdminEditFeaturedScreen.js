import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Alert, Platform, Pressable } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import ChipGroup from '../components/ChipGroup';
import ServingsSelector from '../components/ServingsSelector';
import RecipePreview from '../components/RecipePreview';
import RecipeEmoji from '../components/RecipeEmoji';
import EmojiPicker from '../components/EmojiPicker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { generateRecipe } from '../lib/ai';
import { getCountryFlag } from '../lib/countryFlags';
import { DISH_TYPES } from '../lib/dishTypes';
import { useTheme } from '../contexts/ThemeContext';
import { spacing } from '../theme/theme';

const CUISINES = ['française', 'italienne', 'espagnole'];

const FAT_OPTIONS = [
  "Huile d'olive",
  'Huile de tournesol',
  'Beurre',
  'Huile de coco',
  'Huile de sésame',
  'Saindoux',
  'Sans matière grasse',
];

const COOKING_OPTIONS = [
  'Au four',
  'Poêle',
  'Vapeur',
  'Grill',
  'Friture',
  'Mijotage',
  'Wok',
  'Sans cuisson',
];

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function AdminEditFeaturedScreen({ route, navigation }) {
  const { user, isAdmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const existing = route?.params?.recipe ?? null;
  const presetCuisine = route?.params?.presetCuisine ?? null;
  const presetTitle = route?.params?.presetTitle ?? '';
  const presetDescription = route?.params?.presetDescription ?? '';

  const [title, setTitle] = useState(existing?.title ?? presetTitle);
  const [description, setDescription] = useState(
    existing?.description ?? presetDescription
  );
  const [ingredients, setIngredients] = useState(existing?.ingredients ?? '');
  const [steps, setSteps] = useState(existing?.steps ?? '');
  const [servings, setServings] = useState(
    existing?.servings != null ? String(existing.servings) : '2'
  );
  const [duration, setDuration] = useState(
    existing?.duration != null ? String(existing.duration) : ''
  );
  const [cookingTemp, setCookingTemp] = useState(
    existing?.cooking_temp != null ? String(existing.cooking_temp) : ''
  );
  const initialCuisine = existing?.cuisine || presetCuisine || '';
  const [cuisineChip, setCuisineChip] = useState(
    CUISINES.includes(initialCuisine) ? initialCuisine : ''
  );
  const [cuisineOther, setCuisineOther] = useState(
    initialCuisine && !CUISINES.includes(initialCuisine) ? initialCuisine : ''
  );
  const [fatType, setFatType] = useState(existing?.fat_type ?? '');
  const [cookingType, setCookingType] = useState(existing?.cooking_type ?? '');
  const [dishType, setDishType] = useState(existing?.dish_type ?? '');
  const [customEmoji, setCustomEmoji] = useState(existing?.custom_emoji ?? null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const effectiveCuisine = cuisineOther.trim() || cuisineChip;

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = 'Titre requis';
    if (!effectiveCuisine) e.cuisine = 'Cuisine requise';
    if (servings && (isNaN(+servings) || +servings <= 0))
      e.servings = 'Invalide';
    if (duration && (isNaN(+duration) || +duration <= 0))
      e.duration = 'Invalide';
    if (cookingTemp && (isNaN(+cookingTemp) || +cookingTemp <= 0))
      e.cookingTemp = 'Invalide';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onGenerateAI = async () => {
    setGenerating(true);
    try {
      const n = parseInt(servings, 10) || 2;
      const result = await generateRecipe({
        servings: n,
        prompt: aiPrompt || title || 'une recette traditionnelle',
        cuisine: effectiveCuisine || undefined,
        userId: user?.id,
      });
      if (result.title) setTitle(result.title);
      if (result.description) setDescription(result.description);
      if (result.ingredients) setIngredients(result.ingredients);
      if (result.steps) setSteps(result.steps);
      if (result.duration) setDuration(String(result.duration));
      if (result.cooking_temp && result.cooking_temp > 0)
        setCookingTemp(String(result.cooking_temp));
      if (result.cooking_type) setCookingType(result.cooking_type);
      if (result.fat_type) setFatType(result.fat_type);
      if (result.dish_type) setDishType(result.dish_type);
    } catch (err) {
      notify('Génération impossible', err.message || 'Erreur');
    } finally {
      setGenerating(false);
    }
  };

  const onSave = async () => {
    if (!validate()) return;
    if (!user || !isAdmin) return notify('Erreur', 'Accès admin requis.');

    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      ingredients: ingredients.trim() || null,
      steps: steps.trim() || null,
      servings: servings ? parseInt(servings, 10) : null,
      duration: duration ? parseInt(duration, 10) : null,
      cooking_temp: cookingTemp ? parseInt(cookingTemp, 10) : null,
      cuisine: effectiveCuisine,
      fat_type: fatType || null,
      cooking_type: cookingType || null,
      dish_type: dishType || 'tout',
      custom_emoji: customEmoji || null,
      featured: true,
      generated_by_ai: false,
    };

    let result;
    if (existing) {
      result = await supabase
        .from('recipes')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();
    } else {
      result = await supabase
        .from('recipes')
        .insert({ ...payload, user_id: user.id })
        .select('*')
        .single();
    }
    setSaving(false);
    if (result.error) return notify('Enregistrement impossible', result.error.message);
    notify('Enregistrée !', existing ? 'Recette mise à jour.' : 'Recette ajoutée au catalogue.');
    navigation.goBack();
  };

  return (
    <Screen>
      <Text style={styles.title}>
        {existing ? 'Modifier la recette' : 'Nouvelle recette du catalogue'}
      </Text>

      <Text style={styles.sectionLabel}>Emoji</Text>
      <Pressable
        onPress={() => setEmojiPickerOpen(true)}
        style={({ pressed }) => [
          styles.emojiField,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityLabel="Choisir un emoji"
      >
        <RecipeEmoji
          title={title || 'Recette'}
          customEmoji={customEmoji}
          size={32}
        />
        <Text style={styles.emojiFieldHint}>
          {customEmoji ? 'Emoji personnalisé' : 'Emoji automatique — taper pour personnaliser'}
        </Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Cuisine *</Text>
      <ChipGroup
        options={CUISINES}
        value={cuisineChip}
        onChange={(v) => {
          setCuisineChip(v);
          if (v) setCuisineOther('');
        }}
        disabled={generating || saving}
        formatLabel={(v) => `${getCountryFlag(v)} ${v}`}
      />
      <Input
        value={cuisineOther}
        onChangeText={(v) => {
          setCuisineOther(v);
          if (v) setCuisineChip('');
        }}
        placeholder="Autre cuisine..."
        error={errors.cuisine}
        editable={!generating && !saving}
        maxLength={40}
      />

      <Text style={styles.sectionLabel}>Type de plat</Text>
      <ChipGroup
        options={DISH_TYPES.map((d) => d.key)}
        value={dishType}
        onChange={(v) => setDishType(v)}
        disabled={generating || saving}
        formatLabel={(v) => {
          const d = DISH_TYPES.find((x) => x.key === v);
          return d ? `${d.emoji} ${d.label}` : v;
        }}
      />

      <View style={styles.aiBox}>
        <Text style={styles.aiTitle}>✨ Générer avec l'IA</Text>
        <Text style={styles.aiHint}>
          Remplit automatiquement les champs ci-dessous
        </Text>
        <Input
          value={aiPrompt}
          onChangeText={setAiPrompt}
          placeholder="ex : Pâtes aux champignons, ou laisser vide"
          editable={!generating && !saving}
          maxLength={120}
        />
        <Pressable
          onPress={onGenerateAI}
          disabled={generating || saving}
          style={({ pressed }) => [
            styles.aiBtn,
            (generating || saving) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.aiBtnText}>
            {generating ? 'Génération...' : 'Générer'}
          </Text>
        </Pressable>
      </View>

      <Input
        label="Titre *"
        value={title}
        onChangeText={setTitle}
        placeholder="Nom de la recette"
        error={errors.title}
        editable={!generating && !saving}
        maxLength={120}
      />

      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Courte description"
        multiline
        numberOfLines={3}
        style={styles.multiline}
        editable={!generating && !saving}
      />

      <Input
        label="Ingrédients"
        value={ingredients}
        onChangeText={setIngredients}
        placeholder="Un ingrédient par ligne ou séparés par des virgules"
        multiline
        numberOfLines={6}
        style={styles.multilineLarge}
        editable={!generating && !saving}
        textAlignVertical="top"
      />

      <Input
        label="Étapes"
        value={steps}
        onChangeText={setSteps}
        placeholder={'1. ...\n2. ...'}
        multiline
        numberOfLines={6}
        style={styles.multilineLarge}
        editable={!generating && !saving}
        textAlignVertical="top"
      />

      <Text style={styles.sectionLabel}>Portions</Text>
      <ServingsSelector
        value={servings}
        onChange={setServings}
        disabled={generating || saving}
      />

      <View style={{ marginTop: spacing.md }}>
        <Input
          label="Durée (min)"
          value={duration}
          onChangeText={setDuration}
          placeholder="45"
          keyboardType="number-pad"
          error={errors.duration}
          editable={!generating && !saving}
          maxLength={4}
        />
      </View>

      <Input
        label="Température (°C)"
        value={cookingTemp}
        onChangeText={setCookingTemp}
        placeholder="180"
        keyboardType="number-pad"
        error={errors.cookingTemp}
        editable={!generating && !saving}
        maxLength={3}
      />

      <Text style={styles.sectionLabel}>Type de cuisson</Text>
      <ChipGroup
        options={COOKING_OPTIONS}
        value={cookingType}
        onChange={setCookingType}
        disabled={generating || saving}
      />

      <Text style={styles.sectionLabel}>Matière grasse</Text>
      <ChipGroup
        options={FAT_OPTIONS}
        value={fatType}
        onChange={setFatType}
        disabled={generating || saving}
      />

      {(title || ingredients || steps) && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
            Aperçu
          </Text>
          <RecipePreview
            recipe={{
              title,
              description,
              ingredients,
              steps,
              duration: duration ? parseInt(duration, 10) : null,
              cooking_temp: cookingTemp ? parseInt(cookingTemp, 10) : null,
              cooking_type: cookingType,
              fat_type: fatType,
            }}
          />
        </>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Button
          title={existing ? 'Enregistrer' : 'Créer'}
          onPress={onSave}
          loading={saving}
          disabled={generating}
        />
        <View style={{ height: spacing.sm }} />
        <Button
          title="Annuler"
          variant="ghost"
          onPress={() => navigation.goBack()}
          disabled={saving}
        />
      </View>

      <EmojiPicker
        visible={emojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        onSelect={(v) => setCustomEmoji(v)}
        current={customEmoji}
      />
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  emojiField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  emojiFieldHint: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  multiline: { minHeight: 80, paddingTop: spacing.md },
  multilineLarge: { minHeight: 140, paddingTop: spacing.md },

  aiBox: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    padding: 14,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  aiTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  aiHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 8 },
  aiBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  aiBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
