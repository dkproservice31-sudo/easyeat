import React, { useEffect, useState } from 'react';
import { Text, View, Alert, Platform, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import ChipGroup from '../components/ChipGroup';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, spacing, typography } from '../theme/theme';

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

export default function EditRecipeScreen({ navigation, route }) {
  const { recipe } = route.params ?? {};
  const { user } = useAuth();

  const [title, setTitle] = useState(recipe?.title ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [ingredients, setIngredients] = useState(recipe?.ingredients ?? '');
  const [steps, setSteps] = useState(recipe?.steps ?? '');
  const [servings, setServings] = useState(
    recipe?.servings != null ? String(recipe.servings) : ''
  );
  const [duration, setDuration] = useState(
    recipe?.duration != null ? String(recipe.duration) : ''
  );
  const [cookingTemp, setCookingTemp] = useState(
    recipe?.cooking_temp != null ? String(recipe.cooking_temp) : ''
  );

  const [fatValue, setFatValue] = useState(recipe?.fat_type ?? '');
  const [fatCustoms, setFatCustoms] = useState([]);
  const [cookValue, setCookValue] = useState(recipe?.cooking_type ?? '');
  const [cookCustoms, setCookCustoms] = useState([]);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('custom_options')
        .select('id, option_type, value')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (cancelled || error) return;
      setFatCustoms(data.filter((o) => o.option_type === 'fat_type'));
      setCookCustoms(data.filter((o) => o.option_type === 'cooking_type'));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const addCustomOption = async (type, value) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('custom_options')
      .insert({ user_id: user.id, option_type: type, value })
      .select('id, option_type, value')
      .single();
    if (error) return notify('Ajout impossible', error.message);
    const setter = type === 'fat_type' ? setFatCustoms : setCookCustoms;
    const setValue = type === 'fat_type' ? setFatValue : setCookValue;
    setter((c) => [...c, data]);
    setValue(value);
  };

  const deleteCustomOption = async (type, custom) => {
    const ok = await confirmDialog(
      'Supprimer cette option ?',
      'Elle disparaîtra de toutes vos recettes futures.'
    );
    if (!ok) return;
    const { error } = await supabase
      .from('custom_options')
      .delete()
      .eq('id', custom.id);
    if (error) return notify('Suppression impossible', error.message);
    const setter = type === 'fat_type' ? setFatCustoms : setCookCustoms;
    const currentValue = type === 'fat_type' ? fatValue : cookValue;
    const setValue = type === 'fat_type' ? setFatValue : setCookValue;
    setter((c) => c.filter((x) => x.id !== custom.id));
    if (currentValue === custom.value) setValue('');
  };

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = 'Titre requis';
    if (servings && (isNaN(+servings) || +servings <= 0))
      e.servings = 'Nombre invalide';
    if (duration && (isNaN(+duration) || +duration <= 0))
      e.duration = 'Nombre invalide';
    if (cookingTemp && (isNaN(+cookingTemp) || +cookingTemp <= 0))
      e.cookingTemp = 'Nombre invalide';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;
    if (!user || !recipe?.id) return notify('Erreur', 'Contexte invalide.');

    setLoading(true);
    const updates = {
      title: title.trim(),
      description: description.trim() || null,
      ingredients: ingredients.trim() || null,
      steps: steps.trim() || null,
      servings: servings ? parseInt(servings, 10) : null,
      duration: duration ? parseInt(duration, 10) : null,
      cooking_temp: cookingTemp ? parseInt(cookingTemp, 10) : null,
      fat_type: fatValue || null,
      cooking_type: cookValue || null,
    };
    const { data, error } = await supabase
      .from('recipes')
      .update(updates)
      .eq('id', recipe.id)
      .select('*')
      .single();
    setLoading(false);

    if (error) return notify('Modification impossible', error.message);
    notify('Recette modifiée', 'Vos changements sont enregistrés.');
    // Retour au détail avec données fraîches
    navigation.navigate('RecipeDetail', { recipe: data });
  };

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
        Modifier la recette
      </Text>
      <Text style={[typography.small, { marginBottom: spacing.xl }]}>
        Ajustez ce qui doit l'être
      </Text>

      <Input
        label="Titre *"
        value={title}
        onChangeText={setTitle}
        placeholder="Tarte aux pommes de grand-mère"
        error={errors.title}
        editable={!loading}
        maxLength={120}
      />

      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Une tarte gourmande et parfumée..."
        multiline
        numberOfLines={3}
        style={styles.multiline}
        editable={!loading}
      />

      <Input
        label="Ingrédients"
        value={ingredients}
        onChangeText={setIngredients}
        placeholder={'6 pommes\n200g de farine\n100g de beurre\n...'}
        multiline
        numberOfLines={6}
        style={styles.multilineLarge}
        editable={!loading}
        textAlignVertical="top"
      />

      <Input
        label="Étapes"
        value={steps}
        onChangeText={setSteps}
        placeholder={'1. Préchauffer le four...\n2. Éplucher les pommes...'}
        multiline
        numberOfLines={6}
        style={styles.multilineLarge}
        editable={!loading}
        textAlignVertical="top"
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Input
            label="Personnes"
            value={servings}
            onChangeText={setServings}
            placeholder="4"
            keyboardType="number-pad"
            error={errors.servings}
            editable={!loading}
            maxLength={3}
          />
        </View>
        <View style={styles.half}>
          <Input
            label="Durée (min)"
            value={duration}
            onChangeText={setDuration}
            placeholder="45"
            keyboardType="number-pad"
            error={errors.duration}
            editable={!loading}
            maxLength={4}
          />
        </View>
      </View>

      <Input
        label="Température de cuisson (°C)"
        value={cookingTemp}
        onChangeText={setCookingTemp}
        placeholder="180"
        keyboardType="number-pad"
        error={errors.cookingTemp}
        editable={!loading}
        maxLength={3}
      />

      <Text style={styles.sectionLabel}>Matière grasse</Text>
      <ChipGroup
        options={FAT_OPTIONS}
        customs={fatCustoms}
        value={fatValue}
        onChange={setFatValue}
        onAddCustom={(v) => addCustomOption('fat_type', v)}
        onDeleteCustom={(c) => deleteCustomOption('fat_type', c)}
        disabled={loading}
      />

      <Text style={styles.sectionLabel}>Type de cuisson</Text>
      <ChipGroup
        options={COOKING_OPTIONS}
        customs={cookCustoms}
        value={cookValue}
        onChange={setCookValue}
        onAddCustom={(v) => addCustomOption('cooking_type', v)}
        onDeleteCustom={(c) => deleteCustomOption('cooking_type', c)}
        disabled={loading}
      />

      <View style={{ marginTop: spacing.md }}>
        <Button title="Enregistrer" onPress={onSave} loading={loading} />
        <View style={{ height: spacing.md }} />
        <Button
          title="Annuler"
          variant="ghost"
          onPress={() => navigation.goBack()}
          disabled={loading}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 80, paddingTop: spacing.md },
  multilineLarge: { minHeight: 140, paddingTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
});
