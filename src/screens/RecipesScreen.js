import React, { useCallback, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import {
  colors,
  radius,
  spacing,
  typography,
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

function RecipeCard({ recipe, onPress }) {
  const meta = [];
  if (recipe.duration) meta.push(`${recipe.duration} min`);
  if (recipe.servings)
    meta.push(`${recipe.servings} pers.`);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.title} numberOfLines={2}>
        {recipe.title}
      </Text>
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
    </Pressable>
  );
}

export default function RecipesScreen({ navigation }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
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
          <Text style={typography.h1}>Recettes</Text>
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
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item}
              onPress={() =>
                navigation.navigate('RecipeDetail', { recipe: item })
              }
            />
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
              <Text style={typography.h3}>Aucune recette</Text>
              <Text
                style={[typography.small, { marginTop: spacing.sm, textAlign: 'center' }]}
              >
                Appuyez sur + pour créer votre première recette.
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
    paddingHorizontal: spacing.md,
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: maxContentWidth,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  desc: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  meta: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  badge: {
    backgroundColor: '#FFF1E8',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, color: colors.primaryDark, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    maxWidth: maxContentWidth,
  },
  error: { color: colors.error, textAlign: 'center' },
});
