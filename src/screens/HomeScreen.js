import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import WebScroll from '../components/WebScroll';
import RecipeEmoji from '../components/RecipeEmoji';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateFr } from '../lib/dateFr';
import { getRecipeEmoji } from '../lib/recipeEmoji';
import { colors, radius, spacing, maxContentWidth } from '../theme/theme';

const BASE_FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'française', label: 'Françaises' },
  { key: 'italienne', label: 'Italiennes' },
  { key: 'espagnole', label: 'Espagnoles' },
];

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

// Fallback emoji fonts pour web (sinon pas de rendu sur Chrome/Windows)
const EMOJI_STYLE =
  Platform.OS === 'web'
    ? {
        fontFamily:
          '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif',
      }
    : null;

function getInitial(username, email) {
  const base = (username || email || '?').trim();
  return base.charAt(0).toUpperCase();
}

function PopularCard({ recipe, added, adding, onAdd, onOpen }) {
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.popCard,
        pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
      ]}
    >
      <RecipeEmoji title={recipe.title} size={40} style={styles.popEmoji} />
      <Text style={styles.popTitle} numberOfLines={2}>
        {recipe.title}
      </Text>
      <Text style={styles.popMeta} numberOfLines={1}>
        {recipe.duration ? `${recipe.duration} min` : ''}
        {recipe.duration && recipe.servings ? ' · ' : ''}
        {recipe.servings ? `${recipe.servings} pers.` : ''}
      </Text>
      <Pressable
        onPress={onAdd}
        disabled={added || adding}
        style={({ pressed }) => [
          styles.popAddBtn,
          added && styles.popAddBtnDone,
          pressed && !added && !adding && { opacity: 0.85 },
          adding && { opacity: 0.6 },
        ]}
      >
        <Text
          style={[styles.popAddText, added && { color: colors.textMuted }]}
        >
          {added ? 'Ajoutée ✓' : adding ? '...' : 'Ajouter'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

function QuickRow({ recipe, onOpen }) {
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.quickRow,
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
    >
      <RecipeEmoji title={recipe.title} size={32} style={styles.quickEmoji} />
      <View style={{ flex: 1 }}>
        <Text style={styles.quickTitle} numberOfLines={1}>
          {recipe.title}
        </Text>
        <Text style={styles.quickMeta} numberOfLines={1}>
          {recipe.duration ? `${recipe.duration} min` : 'Classique'}
          {recipe.servings ? ` · ${recipe.servings} pers.` : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [now] = useState(new Date());
  const [featured, setFeatured] = useState([]);
  const [addedTitles, setAddedTitles] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const { data: feat } = await supabase
      .from('recipes')
      .select('*')
      .eq('featured', true)
      .order('title', { ascending: true });
    setFeatured(feat ?? []);

    if (user) {
      const { data: mine } = await supabase
        .from('recipes')
        .select('title')
        .eq('user_id', user.id)
        .or('featured.is.null,featured.eq.false');
      setAddedTitles(new Set((mine ?? []).map((r) => r.title)));
    } else {
      setAddedTitles(new Set());
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return featured.filter((r) => {
      if (filter !== 'all' && r.cuisine !== filter) return false;
      if (q && !(r.title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [featured, filter, query]);

  // Compteurs par cuisine (calculés depuis featured, ignorent le search)
  const counts = useMemo(() => {
    const by = { all: featured.length };
    for (const r of featured) {
      const c = r.cuisine;
      if (!c) continue;
      by[c] = (by[c] || 0) + 1;
    }
    return by;
  }, [featured]);

  const filtersWithCount = BASE_FILTERS.map((f) => ({
    ...f,
    label: `${f.label} (${counts[f.key] ?? 0})`,
  }));

  const quickSuggestions = useMemo(() => {
    return [...filtered]
      .filter((r) => r.duration && r.duration > 0)
      .sort((a, b) => (a.duration || 0) - (b.duration || 0))
      .slice(0, 5);
  }, [filtered]);

  const onAdd = async (recipe) => {
    if (!user) {
      notify('Connexion requise', 'Connectez-vous pour ajouter une recette.');
      return;
    }
    setAddingId(recipe.id);
    const { error } = await supabase.from('recipes').insert({
      user_id: user.id,
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      servings: recipe.servings,
      duration: recipe.duration,
      cooking_temp: recipe.cooking_temp,
      cooking_type: recipe.cooking_type,
      fat_type: recipe.fat_type,
      cuisine: recipe.cuisine,
      featured: false,
      generated_by_ai: recipe.generated_by_ai ?? true,
    });
    setAddingId(null);
    if (error) return notify('Ajout impossible', error.message);
    setAddedTitles((prev) => new Set(prev).add(recipe.title));
  };

  const username = profile?.username || user?.email?.split('@')[0] || 'Chef';
  const initial = getInitial(profile?.username, user?.email);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WebScroll
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 120 + insets.bottom },
        ]}
      >
        {/* HEADER */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{formatDateFr(now)}</Text>
            <Text style={styles.hello} numberOfLines={1}>
              Bonjour, {username}
            </Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Que cuisinons-nous aujourd'hui ?
        </Text>

        {/* SEARCH */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher une recette..."
            placeholderTextColor="#A9A49C"
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              style={styles.searchClear}
            >
              <Text style={styles.searchClearText}>×</Text>
            </Pressable>
          )}
        </View>

        {/* FILTER CHIPS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          style={styles.filterScroll}
        >
          {filtersWithCount.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* POPULAR CAROUSEL */}
        <Text style={styles.sectionH}>Recettes populaires</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>Aucune recette pour ce filtre.</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.popScrollContent}
            style={styles.popScroll}
          >
            {filtered.map((r) => (
              <PopularCard
                key={r.id}
                recipe={r}
                added={addedTitles.has(r.title)}
                adding={addingId === r.id}
                onAdd={() => onAdd(r)}
                onOpen={() => navigation.navigate('RecipeDetail', { recipe: r })}
              />
            ))}
          </ScrollView>
        )}

        {/* QUICK SUGGESTIONS */}
        <View style={styles.quickHeader}>
          <Text style={[styles.sectionH, { marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]}>
            Suggestions rapides
          </Text>
          <Pressable
            onPress={() => {
              setQuery('');
              setFilter('all');
            }}
            hitSlop={6}
          >
            <Text style={styles.seeAll}>Voir tout</Text>
          </Pressable>
        </View>
        {loading ? null : quickSuggestions.length === 0 ? (
          <Text style={styles.emptyText}>Pas encore de suggestions.</Text>
        ) : (
          <View style={styles.quickList}>
            {quickSuggestions.map((r) => (
              <QuickRow
                key={r.id}
                recipe={r}
                onOpen={() => navigation.navigate('RecipeDetail', { recipe: r })}
              />
            ))}
          </View>
        )}
      </WebScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { paddingTop: 'env(safe-area-inset-top)' } : null),
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: spacing.md,
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
  },
  date: { fontSize: 13, color: '#999' },
  hello: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
  },

  // Search
  searchWrap: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEE',
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  searchClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontSize: 16,
    color: '#999',
    lineHeight: 18,
    marginTop: -1,
  },

  // Filters — edge-to-edge
  filterScroll: {
    marginTop: spacing.md,
  },
  filterScrollContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  // Sections
  sectionH: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
  },
  emptyText: {
    fontSize: 13,
    color: '#888',
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
  },

  // Popular carousel — edge-to-edge
  popScroll: {},
  popScrollContent: {
    gap: 12,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
  },
  popCard: {
    width: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    padding: spacing.md,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  popEmoji: { marginBottom: 4 },
  popTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 16,
    textAlign: 'center',
  },
  popMeta: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  popAddBtn: {
    marginTop: spacing.sm,
    minHeight: 36,
    width: '100%',
    backgroundColor: '#FFF0E8',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popAddBtnDone: { backgroundColor: '#EFEFEF' },
  popAddText: { color: colors.primary, fontSize: 12, fontWeight: '700' },

  // Quick suggestions
  quickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
  },
  seeAll: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  quickList: {
    marginHorizontal: spacing.md,
    gap: spacing.sm,
  },
  quickRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickEmoji: {},
  quickTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  quickMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  chevron: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '700',
  },
});
