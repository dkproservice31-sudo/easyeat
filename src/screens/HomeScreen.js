import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebScroll from '../components/WebScroll';
import TutorialModal from '../components/TutorialModal';
import RecipeEmoji from '../components/RecipeEmoji';
import FadeInView from '../components/FadeInView';
import PressableScale from '../components/PressableScale';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { formatDateFr } from '../lib/dateFr';
import { getRecipeEmoji } from '../lib/recipeEmoji';
import { formatDuration } from '../lib/formatDuration';
import { getCountryFlag, getCountryDescription } from '../lib/countryFlags';
import {
  isCuisineActive,
  isCuisineUpcoming,
  todayIso,
} from '../lib/cuisinesFilter';
import {
  DISH_TYPES,
  DISH_FILTER_ALL,
  matchesDishType,
  normalizeDishType,
} from '../lib/dishTypes';
import { radius, spacing, maxContentWidth } from '../theme/theme';

// Met la première lettre en capitale pour l'affichage
function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

function RatingLabel({ rating, styles }) {
  if (!rating || rating.count === 0) {
    return <Text style={styles.popRatingNone}>☆ Pas noté</Text>;
  }
  return <Text style={styles.popRating}>⭐ {rating.avg.toFixed(1)}</Text>;
}

function PopularCard({
  recipe,
  added,
  adding,
  onAdd,
  onOpen,
  canInteract = true,
  showAddButton = true,
  styles,
  colors,
  rating,
}) {
  return (
    <PressableScale
      onPress={canInteract ? onOpen : undefined}
      disabled={!canInteract}
      style={styles.popCard}
    >
      {normalizeDishType(recipe.dish_type) === 'vegan' ? (
        <View style={styles.veganBadge}>
          <Text style={styles.veganBadgeText}>🌱</Text>
        </View>
      ) : null}
      <RecipeEmoji recipe={recipe} size={40} style={styles.popEmoji} />
      <Text style={styles.popTitle} numberOfLines={2}>
        {recipe.title}
      </Text>
      <Text style={styles.popMeta} numberOfLines={1}>
        {recipe.duration ? formatDuration(recipe.duration) : ''}
        {recipe.duration && recipe.servings ? ' · ' : ''}
        {recipe.servings ? `${recipe.servings} pers.` : ''}
      </Text>
      <RatingLabel rating={rating} styles={styles} />
      {showAddButton && (
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
            style={[styles.popAddText, added && { color: colors.textSecondary }]}
          >
            {added ? 'Ajoutée ✓' : adding ? '...' : 'Ajouter'}
          </Text>
        </Pressable>
      )}
    </PressableScale>
  );
}

function QuickRow({ recipe, onOpen, canInteract = true, styles, rating }) {
  return (
    <PressableScale
      onPress={canInteract ? onOpen : undefined}
      disabled={!canInteract}
      style={styles.quickRow}
      scaleTo={0.95}
    >
      <RecipeEmoji recipe={recipe} size={32} style={styles.quickEmoji} />
      <View style={{ flex: 1 }}>
        <Text style={styles.quickTitle} numberOfLines={1}>
          {recipe.title}
        </Text>
        <Text style={styles.quickMeta} numberOfLines={1}>
          {recipe.duration ? formatDuration(recipe.duration) : 'Classique'}
          {recipe.servings ? ` · ${recipe.servings} pers.` : ''}
          {rating && rating.count > 0 ? ` · ⭐ ${rating.avg.toFixed(1)}` : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressableScale>
  );
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [now] = useState(new Date());
  const [featured, setFeatured] = useState([]);
  const [cuisinesTable, setCuisinesTable] = useState([]);
  const [addedTitles, setAddedTitles] = useState(new Set());
  // { recipeId: { avg, count } }
  const [ratingsMap, setRatingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [filter, setFilter] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [dishFilter, setDishFilter] = useState(DISH_FILTER_ALL);
  const [query, setQuery] = useState('');
  // Filtres rapides DANS la barre de recherche (indépendants des filtres de la page)
  const [searchCountry, setSearchCountry] = useState('all');
  const [searchDish, setSearchDish] = useState(DISH_FILTER_ALL);

  // Didacticiel au premier chargement
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem('tutorialSeen');
        if (!seen) setTutorialOpen(true);
      } catch {}
    })();
  }, [user]);
  const closeTutorial = async () => {
    setTutorialOpen(false);
    try {
      await AsyncStorage.setItem('tutorialSeen', 'true');
    } catch {}
  };

  // Préservation du scroll des carrousels lors d'un retour depuis le détail
  const popScrollRef = useRef(null);
  const popScrollX = useRef(0);
  const filterScrollRef = useRef(null);
  const filterScrollX = useRef(0);

  const load = useCallback(async () => {
    const [{ data: feat }, { data: cui }] = await Promise.all([
      supabase
        .from('recipes')
        .select('*')
        .eq('featured', true)
        .eq('published', true)
        .order('title', { ascending: true }),
      supabase
        .from('cuisines')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('display_name', { ascending: true }),
    ]);
    const featList = feat ?? [];
    setFeatured(featList);
    setCuisinesTable(cui ?? []);

    // Charge les notes pour toutes les recettes featured et calcule moyenne + count
    if (featList.length > 0) {
      const ids = featList.map((r) => r.id);
      const { data: ratings } = await supabase
        .from('ratings')
        .select('recipe_id, rating')
        .in('recipe_id', ids);
      const map = {};
      for (const row of ratings || []) {
        const m = map[row.recipe_id] || { sum: 0, count: 0 };
        m.sum += row.rating;
        m.count += 1;
        map[row.recipe_id] = m;
      }
      const out = {};
      for (const id of Object.keys(map)) {
        out[id] = { avg: map[id].sum / map[id].count, count: map[id].count };
      }
      setRatingsMap(out);
    } else {
      setRatingsMap({});
    }

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

  const hasLoadedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      (async () => {
        // N'affiche le loader qu'au premier chargement : les retours depuis
        // le détail ne doivent pas démonter le carrousel (sinon le scroll
        // est perdu).
        if (!hasLoadedOnce.current) setLoading(true);
        await load();
        hasLoadedOnce.current = true;
        setLoading(false);
      })();
      // Restaure la position des carrousels au retour sur l'écran
      requestAnimationFrame(() => {
        popScrollRef.current?.scrollTo?.({
          x: popScrollX.current,
          animated: false,
        });
        filterScrollRef.current?.scrollTo?.({
          x: filterScrollX.current,
          animated: false,
        });
      });
    }, [load])
  );

  // Recettes featured non encore ajoutées par l'utilisateur (pour affichage)
  const availableFeatured = useMemo(
    () => featured.filter((r) => !addedTitles.has(r.title)),
    [featured, addedTitles]
  );

  // Filtre de la semaine courante : cuisines visibles + dans la période planifiée
  const activeCuisines = useMemo(
    () => cuisinesTable.filter((c) => isCuisineActive(c)),
    [cuisinesTable]
  );
  const upcomingCuisines = useMemo(
    () => cuisinesTable.filter((c) => isCuisineUpcoming(c)),
    [cuisinesTable]
  );

  // Map name (normalized) → cuisine row pour résoudre flag/description via la BDD
  const cuisineByName = useMemo(() => {
    const m = {};
    for (const c of cuisinesTable) {
      m[(c.name || '').trim().toLowerCase()] = c;
    }
    return m;
  }, [cuisinesTable]);

  // Chips : uniquement les cuisines actives qui ont au moins une recette
  const filtersWithCount = useMemo(() => {
    const counts = {};
    for (const r of availableFeatured) {
      const c = (r.cuisine || '').trim().toLowerCase();
      if (!c) continue;
      counts[c] = (counts[c] || 0) + 1;
    }
    // Si la table cuisines est vide (pas encore migrée), on retombe sur l'ancien
    // comportement : déduire depuis les recettes.
    if (activeCuisines.length === 0) {
      const cuisineKeys = Object.keys(counts).sort((a, b) => {
        const diff = counts[b] - counts[a];
        return diff !== 0 ? diff : a.localeCompare(b);
      });
      return cuisineKeys.map((k) => ({
        key: k,
        label: `${getCountryFlag(k)} ${capitalize(k)} (${counts[k]})`,
      }));
    }
    return activeCuisines
      .filter((c) => (counts[(c.name || '').trim().toLowerCase()] || 0) > 0)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((c) => {
        const key = (c.name || '').trim().toLowerCase();
        return {
          key,
          label: `${c.flag || getCountryFlag(key)} ${c.display_name || capitalize(key)} (${counts[key] || 0})`,
        };
      });
  }, [availableFeatured, activeCuisines]);

  // Sélectionne le premier pays par défaut (ou si le filtre courant n'existe plus)
  useEffect(() => {
    if (filtersWithCount.length === 0) return;
    if (!filter || !filtersWithCount.some((f) => f.key === filter)) {
      setFilter(filtersWithCount[0].key);
    }
  }, [filtersWithCount, filter]);

  // Réinitialise le scroll du carrousel populaire quand un filtre change
  useEffect(() => {
    popScrollX.current = 0;
    popScrollRef.current?.scrollTo?.({ x: 0, animated: false });
  }, [filter, dishFilter]);

  const filtered = useMemo(() => {
    return availableFeatured.filter((r) => {
      if (!filter) return false;
      if ((r.cuisine || '').trim().toLowerCase() !== filter) return false;
      if (!matchesDishType(r.dish_type, dishFilter)) return false;
      return true;
    });
  }, [availableFeatured, filter, dishFilter]);

  // Liste des cuisines disponibles (pour les puces drapeau de la recherche)
  const searchCountries = useMemo(() => {
    const set = new Set();
    for (const r of availableFeatured) {
      const c = (r.cuisine || '').trim().toLowerCase();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [availableFeatured]);

  // L'overlay est ouvert dès que l'input a le focus, OU que l'utilisateur
  // a tapé du texte. La recherche réelle ne se déclenche qu'à partir de 2 car.
  const searchActive = searchFocused || query.trim().length >= 2;
  const searchHasQuery = query.trim().length >= 2;
  const searchResults = useMemo(() => {
    if (!searchHasQuery) return [];
    const q = query.trim().toLowerCase();
    return availableFeatured
      .filter((r) => (r.title || '').toLowerCase().includes(q))
      .filter((r) =>
        searchCountry === 'all'
          ? true
          : (r.cuisine || '').trim().toLowerCase() === searchCountry
      )
      .filter((r) => matchesDishType(r.dish_type, searchDish))
      .slice(0, 50);
  }, [availableFeatured, query, searchHasQuery, searchCountry, searchDish]);

  const quickSuggestions = useMemo(() => {
    // Tri par note moyenne décroissante ; les non-notées tombent en fin de liste.
    return [...filtered]
      .sort((a, b) => {
        const ra = ratingsMap[a.id];
        const rb = ratingsMap[b.id];
        const va = ra && ra.count > 0 ? ra.avg : -1;
        const vb = rb && rb.count > 0 ? rb.avg : -1;
        if (va !== vb) return vb - va;
        return (a.duration || 0) - (b.duration || 0);
      })
      .slice(0, 5);
  }, [filtered, ratingsMap]);

  const onAdd = async (recipe) => {
    if (!user) {
      navigation.navigate('SignIn');
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
      dish_type: recipe.dish_type || 'tout',
      cuisine: recipe.cuisine,
      custom_emoji: recipe.custom_emoji || null,
      featured: false,
      generated_by_ai: recipe.generated_by_ai ?? true,
    });
    setAddingId(null);
    if (error) return notify('Ajout impossible', error.message);
    // Petit délai pour laisser l'utilisateur voir le ✓ avant le retrait du carrousel
    setTimeout(() => {
      setAddedTitles((prev) => new Set(prev).add(recipe.title));
    }, 600);
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
              {user ? `Bonjour, ${username}` : 'Bienvenue sur EasyEat'}
            </Text>
          </View>
          {user ? (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => navigation.navigate('SignIn')}
              style={({ pressed }) => [
                styles.signInBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.signInBtnText}>Se connecter</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.subtitle}>
          {user
            ? "Que cuisinons-nous aujourd'hui ?"
            : 'Découvrez notre catalogue de recettes'}
        </Text>

        {/* SEARCH */}
        <View style={styles.searchAnchor}>
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchFocused(true)}
              placeholder="Rechercher une recette..."
              placeholderTextColor={colors.textHint}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {(query.length > 0 || searchFocused) && (
              <Pressable
                onPress={() => {
                  setQuery('');
                  setSearchCountry('all');
                  setSearchDish(DISH_FILTER_ALL);
                  setSearchFocused(false);
                }}
                hitSlop={8}
                style={styles.searchClear}
              >
                <Text style={styles.searchClearText}>×</Text>
              </Pressable>
            )}
          </View>

          {searchActive && (
            <Pressable
              style={styles.searchBackdrop}
              onPress={() => {
                setQuery('');
                setSearchCountry('all');
                setSearchDish(DISH_FILTER_ALL);
                setSearchFocused(false);
              }}
            />
          )}

          {searchActive && (
            <View style={styles.searchDropdown}>
              {/* Filtres rapides pays */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.searchChipsContent}
                style={styles.searchChipsRow}
              >
                <PressableScale
                  onPress={() => setSearchCountry('all')}
                  style={[
                    styles.searchChip,
                    searchCountry === 'all' && styles.searchChipActive,
                  ]}
                  scaleTo={0.92}
                >
                  <Text
                    style={[
                      styles.searchChipText,
                      searchCountry === 'all' && styles.searchChipTextActive,
                    ]}
                  >
                    Tous
                  </Text>
                </PressableScale>
                {searchCountries.map((c) => {
                  const active = searchCountry === c;
                  return (
                    <PressableScale
                      key={c}
                      onPress={() => setSearchCountry(c)}
                      style={[
                        styles.searchChip,
                        active && styles.searchChipActive,
                      ]}
                      scaleTo={0.92}
                    >
                      <Text
                        style={[
                          styles.searchChipText,
                          active && styles.searchChipTextActive,
                        ]}
                      >
                        {getCountryFlag(c)}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>

              {/* Filtres rapides type de plat */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.searchChipsContent}
                style={styles.searchChipsRow}
              >
                {[
                  { key: DISH_FILTER_ALL, label: 'Tout' },
                  ...DISH_TYPES.map((d) => ({ key: d.key, label: d.emoji })),
                ].map((d) => {
                  const active = searchDish === d.key;
                  return (
                    <PressableScale
                      key={d.key}
                      onPress={() => setSearchDish(d.key)}
                      style={[
                        styles.searchChip,
                        active && styles.searchChipActive,
                      ]}
                      scaleTo={0.92}
                    >
                      <Text
                        style={[
                          styles.searchChipText,
                          active && styles.searchChipTextActive,
                        ]}
                      >
                        {d.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>

              {/* Résultats */}
              <ScrollView
                style={styles.searchResultsScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {!searchHasQuery ? (
                  <Text style={styles.searchEmpty}>Tapez pour rechercher...</Text>
                ) : searchResults.length === 0 ? (
                  <Text style={styles.searchEmpty}>Aucun résultat.</Text>
                ) : (
                  searchResults.map((r) => {
                    const isAdded = addedTitles.has(r.title);
                    const isAdding = addingId === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => {
                          setQuery('');
                          setSearchCountry('all');
                          setSearchDish(DISH_FILTER_ALL);
                          setSearchFocused(false);
                          navigation.navigate('RecipeDetail', { recipe: r });
                        }}
                        style={({ pressed }) => [
                          styles.searchResultRow,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <RecipeEmoji recipe={r} size={28} />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.searchResultTitle}
                            numberOfLines={1}
                          >
                            {r.title}
                          </Text>
                          <Text style={styles.searchResultMeta} numberOfLines={1}>
                            {getCountryFlag(r.cuisine)}{' '}
                            {r.duration ? formatDuration(r.duration) : ''}
                            {ratingsMap[r.id] && ratingsMap[r.id].count > 0
                              ? ` · ⭐ ${ratingsMap[r.id].avg.toFixed(1)}`
                              : ''}
                          </Text>
                        </View>
                        {user ? (
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation?.();
                              if (isAdded || isAdding) return;
                              onAdd(r);
                            }}
                            disabled={isAdded || isAdding}
                            hitSlop={6}
                            style={({ pressed }) => [
                              styles.searchAddBtn,
                              isAdded && styles.searchAddBtnDone,
                              pressed && !isAdded && !isAdding && { opacity: 0.85 },
                              isAdding && { opacity: 0.6 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.searchAddText,
                                isAdded && { color: colors.textSecondary },
                              ]}
                            >
                              {isAdded ? 'Ajoutée ✓' : isAdding ? '...' : 'Ajouter'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* FILTER CHIPS */}
        <ScrollView
          ref={filterScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          style={styles.filterScroll}
          onScroll={(e) => {
            filterScrollX.current = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
        >
          {filtersWithCount.map((f) => {
            const active = filter === f.key;
            return (
              <PressableScale
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
                scaleTo={0.92}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* DISH TYPE CHIPS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          style={styles.dishScroll}
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
                style={[styles.chip, active && styles.chipActive]}
                scaleTo={0.92}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {d.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {filter ? (
          <View style={styles.countryDescWrap}>
            <Text
              style={styles.countryDesc}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {cuisineByName[filter]?.description || getCountryDescription(filter)}
            </Text>
          </View>
        ) : null}

        {upcomingCuisines.length > 0 ? (
          <View style={styles.upcomingBanner}>
            <Text style={styles.upcomingText} numberOfLines={2}>
              🗓️ La semaine prochaine :{' '}
              {upcomingCuisines
                .map((c) => `${c.flag || '🏳️'} ${c.display_name}`)
                .join(' · ')}
            </Text>
          </View>
        ) : null}

        {/* POPULAR CAROUSEL */}
        <Text style={styles.sectionH}>Recettes populaires</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>Aucune recette pour ce filtre.</Text>
        ) : (
          <ScrollView
            ref={popScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.popScrollContent}
            style={styles.popScroll}
            onScroll={(e) => {
              popScrollX.current = e.nativeEvent.contentOffset.x;
            }}
            scrollEventThrottle={16}
          >
            {filtered.map((r, i) => (
              <FadeInView key={r.id} delay={Math.min(i * 60, 600)}>
                <PopularCard
                  recipe={r}
                  added={addedTitles.has(r.title)}
                  adding={addingId === r.id}
                  canInteract={!!user}
                  showAddButton={!!user}
                  onAdd={() => onAdd(r)}
                  onOpen={() =>
                    navigation.navigate('RecipeDetail', { recipe: r })
                  }
                  styles={styles}
                  colors={colors}
                  rating={ratingsMap[r.id]}
                />
              </FadeInView>
            ))}
          </ScrollView>
        )}

        {/* QUICK SUGGESTIONS */}
        {user && (
        <View style={styles.quickHeader}>
          <Text style={[styles.sectionH, { marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]}>
            Suggestions rapides
          </Text>
          <Pressable
            onPress={() => {
              setQuery('');
              setDishFilter(DISH_FILTER_ALL);
              if (filtersWithCount.length > 0) setFilter(filtersWithCount[0].key);
            }}
            hitSlop={6}
          >
            <Text style={styles.seeAll}>Voir tout</Text>
          </Pressable>
        </View>
        )}
        {user &&
          (loading ? null : quickSuggestions.length === 0 ? (
            <Text style={styles.emptyText}>Pas encore de suggestions.</Text>
          ) : (
            <View style={styles.quickList}>
              {quickSuggestions.map((r, i) => (
                <FadeInView key={r.id} delay={i * 80}>
                  <QuickRow
                    recipe={r}
                    canInteract={!!user}
                    onOpen={() =>
                      navigation.navigate('RecipeDetail', { recipe: r })
                    }
                    styles={styles}
                    rating={ratingsMap[r.id]}
                  />
                </FadeInView>
              ))}
            </View>
          ))}

        {!user && (
          <View style={styles.ctaBanner}>
            <Text style={styles.ctaText}>
              Connectez-vous pour découvrir toutes nos recettes
            </Text>
            <Pressable
              onPress={() => navigation.navigate('SignIn')}
              style={({ pressed }) => [
                styles.ctaBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.ctaBtnText}>Se connecter</Text>
            </Pressable>
          </View>
        )}
      </WebScroll>

      <TutorialModal
        visible={tutorialOpen}
        showWelcome
        onClose={closeTutorial}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
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
  date: { fontSize: 13, color: colors.textTertiary },
  hello: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
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
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  signInBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  ctaBanner: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  ctaBtn: {
    minHeight: 44,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
  },

  // Search
  searchAnchor: {
    position: 'relative',
    zIndex: 50,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  searchBackdrop: {
    ...(Platform.OS === 'web'
      ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }
      : { position: 'absolute', top: 52, left: -1000, right: -1000, bottom: -2000 }),
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 90,
  },
  searchDropdown: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 100,
    overflow: 'hidden',
    maxHeight: 480,
  },
  searchChipsRow: { flexGrow: 0, flexShrink: 0 },
  searchChipsContent: {
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchChip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  searchChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  searchChipTextActive: { color: '#FFFFFF' },
  searchResultsScroll: { maxHeight: 400 },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  searchResultMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  searchEmpty: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  searchAddBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAddBtnDone: {
    backgroundColor: colors.border,
  },
  searchAddText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  searchWrap: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontSize: 16,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: -1,
  },

  upcomingBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  upcomingText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  countryDescWrap: {
    width: '100%',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: 12,
    overflow: 'hidden',
  },
  countryDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    width: '100%',
  },

  // Filters — edge-to-edge
  filterScroll: {
    marginTop: spacing.md,
  },
  dishScroll: {
    marginTop: spacing.sm,
  },
  veganBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.successLight,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 2,
  },
  veganBadgeText: { fontSize: 12 },
  filterScrollContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },

  // Sections
  sectionH: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
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
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  popEmoji: { marginBottom: 4 },
  popTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
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
  popRating: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  popRatingNone: {
    fontSize: 10,
    color: colors.textHint,
    marginTop: 2,
    textAlign: 'center',
  },
  popAddBtn: {
    marginTop: spacing.sm,
    minHeight: 36,
    width: '100%',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popAddBtnDone: { backgroundColor: colors.border },
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
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickEmoji: {},
  quickTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  quickMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  chevron: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '700',
  },
});
