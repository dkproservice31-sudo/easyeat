import React, { useCallback, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import RecipeEmoji from '../components/RecipeEmoji';
import FadeInView from '../components/FadeInView';
import { formatDuration } from '../lib/formatDuration';
import SwipeableCard from '../components/SwipeableCard';
import {
  colors,
  radius,
  spacing,
  maxContentWidth,
} from '../theme/theme';

function MetaBadge({ label }) {
  if (!label) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function RecipeCardContent({ recipe, onQuickDelete }) {
  const meta = [];
  if (recipe.duration) meta.push(formatDuration(recipe.duration));
  if (recipe.servings) meta.push(`${recipe.servings} pers.`);

  return (
    <View>
      <View style={styles.titleRow}>
        <RecipeEmoji title={recipe.title} size={32} />
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
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
                { color: pressed ? '#e74c3c' : '#ccc' },
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
          <MetaBadge label={recipe.cooking_type} />
          <MetaBadge label={recipe.fat_type} />
        </View>
      )}
    </View>
  );
}


export default function RecipesScreen({ navigation }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);

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
          data={recipes}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    color: '#1A1A1A',
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
    color: '#fff',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  aiBadge: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  aiBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  desc: {
    fontSize: 13,
    color: '#888',
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
    backgroundColor: '#FFF0E8',
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
    color: '#666',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: '#AAA',
    marginTop: 6,
    textAlign: 'center',
  },
  error: { color: colors.error, textAlign: 'center' },
});
