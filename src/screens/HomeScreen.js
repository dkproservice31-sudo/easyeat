import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Screen from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateFr, formatTimeFr } from '../lib/dateFr';
import {
  colors,
  radius,
  spacing,
  typography,
  maxContentWidth,
} from '../theme/theme';

const SECTIONS = [
  { cuisine: 'française', title: '🇫🇷 Recettes françaises' },
  { cuisine: 'italienne', title: '🇮🇹 Recettes italiennes' },
  { cuisine: 'espagnole', title: '🇪🇸 Recettes espagnoles' },
];

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function FeaturedRow({ recipe, added, adding, onAdd, onPress }) {
  const meta = [];
  if (recipe.duration) meta.push(`${recipe.duration} min`);
  if (recipe.servings) meta.push(`${recipe.servings} pers.`);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {recipe.title}
        </Text>
        {meta.length > 0 && (
          <Text style={styles.rowMeta}>{meta.join('  ·  ')}</Text>
        )}
      </View>
      <Pressable
        onPress={onAdd}
        disabled={added || adding}
        style={({ pressed }) => [
          styles.addBtn,
          added && styles.addBtnDone,
          pressed && !added && !adding && { opacity: 0.85 },
          adding && { opacity: 0.6 },
        ]}
      >
        <Text
          style={[styles.addBtnText, added && { color: colors.textMuted }]}
        >
          {added ? 'Ajoutée ✓' : adding ? '...' : 'Ajouter'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

function CuisineSection({
  title,
  recipes,
  loading,
  addedTitles,
  addingId,
  onAdd,
  onOpen,
  width,
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? recipes.filter((r) => (r.title || '').toLowerCase().includes(q))
    : recipes;

  return (
    <View style={[styles.section, { width }]}>
      <Text style={styles.sectionTitle}>
        {title} ({recipes.length})
      </Text>
      <View style={styles.box}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher..."
            placeholderTextColor={colors.textMuted}
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

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={typography.small}>
              {q ? 'Aucun résultat.' : 'Aucune recette disponible.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {filtered.map((item) => (
              <FeaturedRow
                key={item.id}
                recipe={item}
                added={addedTitles.has(item.title)}
                adding={addingId === item.id}
                onAdd={() => onAdd(item)}
                onPress={() => onOpen(item)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const { width: screenWidth } = useWindowDimensions();
  const [now, setNow] = useState(new Date());
  const [byCuisine, setByCuisine] = useState({});
  const [addedTitles, setAddedTitles] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [page, setPage] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(null);
  const pagerRef = useRef(null);

  // La largeur réelle du pager est mesurée par onLayout (gère correctement
  // les paddings imbriqués de Screen sur web et le max-width).
  // Fallback avant la première mesure : estimation conservative.
  const fallback = Math.min(
    screenWidth - spacing.md * 2 - (Platform.OS === 'web' ? spacing.md * 2 : 0),
    maxContentWidth - (Platform.OS === 'web' ? spacing.md * 2 : 0)
  );
  const pageWidth = pagerWidth ?? fallback;

  useEffect(() => {
    const msToNextMinute = 60000 - (Date.now() % 60000);
    let interval;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const load = useCallback(async () => {
    const { data: feat } = await supabase
      .from('recipes')
      .select('*')
      .eq('featured', true)
      .order('title', { ascending: true });

    const groups = {};
    for (const s of SECTIONS) groups[s.cuisine] = [];
    for (const r of feat ?? []) {
      if (groups[r.cuisine]) groups[r.cuisine].push(r);
    }
    setByCuisine(groups);

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

  const onScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / pageWidth);
    if (idx !== page) setPage(idx);
  };

  const goToPage = (i) => {
    pagerRef.current?.scrollTo({ x: i * pageWidth, animated: true });
    setPage(i);
  };

  return (
    <Screen>
      <View style={styles.dateBlock}>
        <Text style={styles.date}>{formatDateFr(now)}</Text>
        <Text style={styles.time}>{formatTimeFr(now)}</Text>
      </View>

      <Text style={[typography.h1, { marginTop: spacing.xl }]}>Bonjour </Text>
      <Text style={[typography.small, { marginTop: spacing.xs }]}>
        Que cuisinons-nous aujourd'hui ?
      </Text>

      <View
        style={styles.pagerWrap}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== pagerWidth) setPagerWidth(w);
        }}
      >
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          decelerationRate="fast"
          snapToInterval={pageWidth}
          snapToAlignment="start"
          disableIntervalMomentum
          style={{ width: pageWidth }}
        >
          {SECTIONS.map((s) => (
            <CuisineSection
              key={s.cuisine}
              title={s.title}
              recipes={byCuisine[s.cuisine] ?? []}
              loading={loading}
              addedTitles={addedTitles}
              addingId={addingId}
              onAdd={onAdd}
              onOpen={(r) =>
                navigation.navigate('RecipeDetail', { recipe: r })
              }
              width={pageWidth}
            />
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SECTIONS.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => goToPage(i)}
              hitSlop={8}
              style={[styles.dot, page === i && styles.dotActive]}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateBlock: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  date: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  time: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.xs,
    letterSpacing: 1,
  },

  pagerWrap: { marginTop: spacing.xl, width: '100%' },
  section: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  box: {
    height: 400,
    marginRight: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: colors.primary,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    flexDirection: 'column',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    margin: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
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
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: -1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.sm,
    paddingTop: 0,
    gap: spacing.sm,
  },
  center: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF8F0',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 64,
  },
  rowPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  rowMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  addBtnDone: { backgroundColor: '#EFEFEF' },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0D7CE',
  },
  dotActive: { backgroundColor: colors.primary, width: 20 },
});
