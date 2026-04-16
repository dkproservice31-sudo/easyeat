import React, { useCallback, useMemo, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import RecipeEmoji from '../components/RecipeEmoji';
import FadeInView from '../components/FadeInView';
import { formatDuration } from '../lib/formatDuration';
import SwipeableCard from '../components/SwipeableCard';
import PressableScale from '../components/PressableScale';
import {
  DISH_TYPES,
  DISH_FILTER_ALL,
  matchesDishType,
  normalizeDishType,
} from '../lib/dishTypes';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  radius,
  spacing,
  maxContentWidth,
} from '../theme/theme';

function MetaBadge({ label, styles }) {
  if (!label) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function RecipeCardContent({ recipe, onQuickDelete, styles, colors }) {
  const meta = [];
  if (recipe.duration) meta.push(formatDuration(recipe.duration));
  if (recipe.servings) meta.push(`${recipe.servings} pers.`);

  return (
    <View>
      <View style={styles.titleRow}>
        <RecipeEmoji recipe={recipe} size={32} />
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
        {normalizeDishType(recipe.dish_type) === 'vegan' && (
          <View style={styles.veganBadge}>
            <Text style={styles.veganBadgeText}>🌱</Text>
          </View>
        )}
        {recipe.generated_by_ai && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>IA</Text>
          </View>
        )}
      </View>

      {onQuickDelete && (
        <Pressable
          onPress={() => onQuickDelete(recipe)}
          style={styles.trashHit}
          accessibilityLabel="Supprimer la recette"
          hitSlop={6}
        >
          {({ pressed }) => (
            <Text
              style={[
                styles.trashIcon,
                { color: pressed ? colors.danger : colors.textHint },
              ]}
            >
              ×
            </Text>
          )}
        </Pressable>
      )}

      {recipe.description ? (
        <Text style={styles.desc} numberOfLines={2}>
          {recipe.description}
        </Text>
      ) : null}

      {meta.length > 0 && (
        <Text style={styles.meta}>{meta.join('  ·  ')}</Text>
      )}

      {(recipe.cooking_type || recipe.fat_type) && (
        <View style={styles.badges}>
          <MetaBadge label={recipe.cooking_type} styles={styles} />
          <MetaBadge label={recipe.fat_type} styles={styles} />
        </View>
      )}
    </View>
  );
}


export default function RecipesScreen({ navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [dishFilter, setDishFilter] = useState(DISH_FILTER_ALL);

  // Modale "Suggérer une recette à l'admin"
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestCuisine, setSuggestCuisine] = useState('');
  const [suggestDescription, setSuggestDescription] = useState('');
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);

  const openSuggestModal = () => {
    setSuggestTitle('');
    setSuggestCuisine('');
    setSuggestDescription('');
    setSuggestOpen(true);
  };

  const submitSuggestion = async () => {
    if (!user) return;
    if (!suggestTitle.trim() || !suggestCuisine.trim()) {
      const msg = 'Le titre et le pays sont obligatoires.';
      if (Platform.OS === 'web') window.alert(`Champs requis\n\n${msg}`);
      else Alert.alert('Champs requis', msg);
      return;
    }
    setSuggestSubmitting(true);
    const { error: insErr } = await supabase.from('recipe_suggestions').insert({
      user_id: user.id,
      title: suggestTitle.trim(),
      cuisine: suggestCuisine.trim().toLowerCase(),
      description: suggestDescription.trim() || null,
    });
    setSuggestSubmitting(false);
    if (insErr) {
      if (Platform.OS === 'web') window.alert(`Envoi impossible\n\n${insErr.message}`);
      else Alert.alert('Envoi impossible', insErr.message);
      return;
    }
    setSuggestOpen(false);
    if (Platform.OS === 'web')
      window.alert('Merci !\n\nVotre suggestion a été envoyée !');
    else Alert.alert('Merci !', 'Votre suggestion a été envoyée !');
  };

  const filteredRecipes = useMemo(
    () => recipes.filter((r) => matchesDishType(r.dish_type, dishFilter)),
    [recipes, dishFilter]
  );

  const quickDeleteRecipe = async (recipe) => {
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(
          window.confirm(
            'Supprimer cette recette ?\n\nCette action est définitive.'
          )
        )
      : new Promise((resolve) => {
          Alert.alert(
            'Supprimer cette recette ?',
            'Cette action est définitive.',
            [
              {
                text: 'Annuler',
                style: 'cancel',
                onPress: () => resolve(false),
              },
              {
                text: 'Supprimer',
                style: 'destructive',
                onPress: () => resolve(true),
              },
            ]
          );
        }));
    if (ok) onDeleteRecipe(recipe);
  };

  const onDeleteRecipe = async (recipe) => {
    const prev = recipes;
    setRecipes((p) => p.filter((r) => r.id !== recipe.id));
    setOpenCardId(null);
    const { error: delError } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipe.id);
    if (delError) {
      setRecipes(prev);
      if (Platform.OS === 'web')
        window.alert(`Suppression impossible\n\n${delError.message}`);
      else Alert.alert('Suppression impossible', delError.message);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .or('featured.is.null,featured.eq.false')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setRecipes(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Text style={styles.headerTitle}>Recettes</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={openSuggestModal}
              style={({ pressed }) => [
                styles.suggestFab,
                pressed && styles.fabPressed,
              ]}
              accessibilityLabel="Suggérer une recette à l'admin"
              hitSlop={8}
            >
              <Text style={styles.suggestFabText}>💡</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('AddRecipe')}
              style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
              accessibilityLabel="Ajouter une recette"
              hitSlop={8}
            >
              <Text style={styles.fabText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dishChipsContent}
        style={styles.dishChipsScroll}
      >
        {[
          { key: DISH_FILTER_ALL, label: 'Tout' },
          ...DISH_TYPES.map((d) => ({
            key: d.key,
            label: `${d.emoji} ${d.label}`,
          })),
        ].map((d) => {
          const active = dishFilter === d.key;
          return (
            <PressableScale
              key={d.key}
              onPress={() => setDishFilter(d.key)}
              style={[styles.dishChip, active && styles.dishChipActive]}
              scaleTo={0.92}
            >
              <Text style={[styles.dishChipText, active && styles.dishChipTextActive]}>
                {d.label}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>Erreur : {error}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <FadeInView
              delay={Math.min(index * 60, 600)}
              style={styles.cardWrap}
            >
              <SwipeableCard
                id={item.id}
                openCardId={openCardId}
                onOpenChange={setOpenCardId}
                onDelete={() => onDeleteRecipe(item)}
                onPress={() =>
                  navigation.navigate('RecipeDetail', { recipe: item })
                }
                confirmTitle="Supprimer cette recette ?"
                confirmMessage="Cette action est définitive."
                borderRadius={16}
              >
                <View style={styles.card}>
                  <RecipeCardContent
                    recipe={item}
                    onQuickDelete={quickDeleteRecipe}
                    styles={styles}
                    colors={colors}
                  />
                </View>
              </SwipeableCard>
            </FadeInView>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🍳</Text>
              <Text style={styles.emptyTitle}>Aucune recette pour le moment</Text>
              <Text style={styles.emptyHint}>
                Appuyez sur + pour en créer une
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={suggestOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSuggestOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Suggérer une recette</Text>
            <Text style={styles.modalHint}>
              Proposez cette recette pour le catalogue.
            </Text>

            <Text style={styles.modalLabel}>Titre *</Text>
            <TextInput
              value={suggestTitle}
              onChangeText={setSuggestTitle}
              placeholder="Ex: Couscous royal, Pad Thaï..."
              placeholderTextColor={colors.textHint}
              style={styles.modalInput}
              maxLength={120}
              editable={!suggestSubmitting}
            />

            <Text style={styles.modalLabel}>Pays / Cuisine *</Text>
            <TextInput
              value={suggestCuisine}
              onChangeText={setSuggestCuisine}
              placeholder="Ex: marocaine, thaïlandaise..."
              placeholderTextColor={colors.textHint}
              style={styles.modalInput}
              maxLength={40}
              autoCapitalize="none"
              editable={!suggestSubmitting}
            />

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              value={suggestDescription}
              onChangeText={setSuggestDescription}
              placeholder="Pourquoi cette recette ? (optionnel)"
              placeholderTextColor={colors.textHint}
              style={[styles.modalInput, styles.modalInputMultiline]}
              multiline
              numberOfLines={3}
              maxLength={300}
              textAlignVertical="top"
              editable={!suggestSubmitting}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setSuggestOpen(false)}
                disabled={suggestSubmitting}
                style={({ pressed }) => [
                  styles.modalCancelBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={submitSuggestion}
                disabled={suggestSubmitting}
                style={({ pressed }) => [
                  styles.modalSubmitBtn,
                  suggestSubmitting && { opacity: 0.6 },
                  pressed && !suggestSubmitting && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalSubmitText}>
                  {suggestSubmitting ? 'Envoi...' : 'Envoyer la suggestion'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  headerInner: {
    width: '100%',
    maxWidth: maxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
    marginTop: -2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    gap: 12,
  },
  cardWrap: {
    width: '100%',
    maxWidth: maxContentWidth,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    position: 'relative',
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  trashHit: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIcon: { fontSize: 16, fontWeight: '600', lineHeight: 18 },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  suggestFab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestFabText: { fontSize: 20, lineHeight: 22 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 10,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  modalInputMultiline: { minHeight: 70, paddingTop: 10 },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  modalSubmitBtn: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  veganBadge: {
    backgroundColor: colors.successLight,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  veganBadgeText: { fontSize: 14 },
  dishChipsScroll: {
    marginBottom: 20,
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'visible',
  },
  dishChipsContent: {
    gap: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  dishChip: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dishChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  dishChipTextActive: { color: '#FFFFFF' },
  aiBadge: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  aiBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  desc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  meta: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 80,
    maxWidth: maxContentWidth,
  },
  emptyEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textHint,
    marginTop: 6,
    textAlign: 'center',
  },
  error: { color: colors.danger, textAlign: 'center' },
});
