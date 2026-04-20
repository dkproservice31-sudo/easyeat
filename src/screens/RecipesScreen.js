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
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebScroll from '../components/WebScroll';
import TutorialModal from '../components/TutorialModal';
import RecipeEmoji from '../components/RecipeEmoji';
import FadeInView from '../components/FadeInView';
import PressableScale from '../components/PressableScale';
import SwipeableCard from '../components/SwipeableCard';
import NotificationBell from '../components/NotificationBell';
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
import { countExpiringItems } from '../lib/expirationStatus';
import { markRecipeAsCooked } from '../lib/fridgeDeduction';
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

function MetaBadge({ label, styles }) {
  if (!label) return null;
  return (
    <View style={styles.myBadge}>
      <Text style={styles.myBadgeText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function RecipeCardContent({ recipe, styles, colors }) {
  const meta = [];
  if (recipe.duration) meta.push(formatDuration(recipe.duration));
  if (recipe.servings) meta.push(`${recipe.servings} pers.`);

  return (
    <View>
      <View style={styles.myTitleRow}>
        <RecipeEmoji recipe={recipe} size={32} />
        <Text style={styles.myTitle} numberOfLines={2}>
          {recipe.title}
        </Text>
        {normalizeDishType(recipe.dish_type) === 'vegan' ? (
          <View style={styles.myVeganBadge}>
            <Text style={styles.myVeganBadgeText}>🌱</Text>
          </View>
        ) : null}
        {recipe.generated_by_ai ? (
          <View style={styles.myAiBadge}>
            <Text style={styles.myAiBadgeText}>IA</Text>
          </View>
        ) : null}
      </View>

      {recipe.description ? (
        <Text style={styles.myDesc} numberOfLines={2}>
          {recipe.description}
        </Text>
      ) : null}

      {meta.length > 0 ? (
        <Text style={styles.myMeta}>{meta.join('  ·  ')}</Text>
      ) : null}

      {recipe.cooking_type || recipe.fat_type ? (
        <View style={styles.myBadges}>
          <MetaBadge label={recipe.cooking_type} styles={styles} />
          <MetaBadge label={recipe.fat_type} styles={styles} />
        </View>
      ) : null}
    </View>
  );
}

function SuggestRecipeModal({ visible, onClose, onSubmit, colors, styles }) {
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setCuisine('');
    setDescription('');
  };

  const handleSubmit = async () => {
    if (!title.trim() || !cuisine.trim()) return;
    setSaving(true);
    const ok = await onSubmit({
      title: title.trim(),
      cuisine: cuisine.trim().toLowerCase(),
      description: description.trim() || null,
    });
    setSaving(false);
    if (ok) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.createModalOverlay}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => {
            if (!saving) onClose();
          }}
        />
        <View
          style={[
            styles.suggestModalContent,
            { backgroundColor: colors.background },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.suggestTitle, { color: colors.text }]}>
              💡 Suggérer une recette
            </Text>
            <Text style={[styles.suggestSubtitle, { color: colors.textSecondary }]}>
              Propose une recette que tu aimerais voir dans le catalogue public. Notre équipe la validera avant de l'ajouter.
            </Text>

            <Text style={[styles.suggestLabel, { color: colors.text }]}>
              Titre *
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Couscous royal, Pad Thaï..."
              placeholderTextColor={colors.textHint}
              style={[
                styles.suggestInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              maxLength={120}
              editable={!saving}
            />

            <Text style={[styles.suggestLabel, { color: colors.text }]}>
              Pays / Cuisine *
            </Text>
            <TextInput
              value={cuisine}
              onChangeText={setCuisine}
              placeholder="Ex: marocaine, thaïlandaise..."
              placeholderTextColor={colors.textHint}
              style={[
                styles.suggestInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              maxLength={40}
              autoCapitalize="none"
              editable={!saving}
            />

            <Text style={[styles.suggestLabel, { color: colors.text }]}>
              Description (optionnel)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Pourquoi cette recette ? (optionnel)"
              placeholderTextColor={colors.textHint}
              style={[
                styles.suggestInput,
                styles.suggestInputMultiline,
                {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              multiline
              numberOfLines={3}
              maxLength={300}
              textAlignVertical="top"
              editable={!saving}
            />

            <View style={styles.suggestActions}>
              <Pressable
                onPress={() => {
                  if (!saving) onClose();
                }}
                disabled={saving}
                style={({ pressed }) => [
                  styles.suggestBtnSecondary,
                  { borderColor: colors.border },
                  pressed && !saving && { opacity: 0.7 },
                ]}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                  Annuler
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!title.trim() || !cuisine.trim() || saving}
                style={({ pressed }) => [
                  styles.suggestBtnPrimary,
                  { backgroundColor: colors.primary },
                  (!title.trim() || !cuisine.trim() || saving) && { opacity: 0.5 },
                  pressed && !saving && { opacity: 0.85 },
                ]}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                  {saving ? 'Envoi...' : 'Envoyer'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

export default function RecipesScreen() {
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
  // Compteur items urgents/périmés pour la cloche du header
  const [urgentCount, setUrgentCount] = useState(0);
  // Recettes perso du user (fusionné depuis l'ancien RecipesScreen)
  const [myRecipes, setMyRecipes] = useState([]);
  // Modales de création (FAB +)
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  // Swipe-to-delete pour "Mes recettes"
  const [openCardId, setOpenCardId] = useState(null);

  const loadUrgent = useCallback(async () => {
    if (!user) {
      setUrgentCount(0);
      return;
    }
    const { data } = await supabase
      .from('fridge_items')
      .select('id, expiration_date, shelf_life_days')
      .eq('user_id', user.id)
      .not('expiration_date', 'is', null);
    const counts = countExpiringItems(data ?? []);
    setUrgentCount(counts.expired + counts.urgent);
  }, [user]);

  const loadMyRecipes = useCallback(async () => {
    if (!user) {
      setMyRecipes([]);
      return;
    }
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('user_id', user.id)
      .or('featured.is.null,featured.eq.false')
      .order('created_at', { ascending: false });
    setMyRecipes(data ?? []);
  }, [user]);

  const handleSuggestSubmit = async (data) => {
    if (!user) return false;
    const { error } = await supabase.from('recipe_suggestions').insert({
      user_id: user.id,
      title: data.title,
      cuisine: data.cuisine,
      description: data.description,
    });
    if (error) {
      notify('Envoi impossible', error.message);
      return false;
    }
    notify(
      'Merci ! 💡',
      "Ta suggestion a été envoyée à l'équipe. Nous la validerons sous peu."
    );
    return true;
  };

  const handleQuickCooked = async (recipe) => {
    if (!user) return;
    const confirmMsg = `Les ingrédients de "${recipe.title}" seront retirés de ton frigo. Continuer ?`;
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(window.confirm(`✓ Marquer comme cuisinée\n\n${confirmMsg}`))
      : new Promise((resolve) => {
          Alert.alert('✓ Marquer comme cuisinée', confirmMsg, [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Oui, cuisinée', onPress: () => resolve(true) },
          ]);
        }));
    if (!ok) return;

    try {
      const { deducted } = await markRecipeAsCooked({
        recipe,
        userId: user.id,
        rating: null,
      });
      const msg =
        deducted.length > 0
          ? `${deducted.length} ingrédient${deducted.length > 1 ? 's' : ''} retiré${deducted.length > 1 ? 's' : ''} du frigo.`
          : 'Recette marquée comme cuisinée (aucun ingrédient matché dans ton frigo).';
      notify('🍽️ Bon appétit !', msg);
      // Refresh pour montrer times_cooked mis à jour si affiché un jour
      loadMyRecipes();
    } catch (err) {
      notify('Erreur', err?.message || 'Impossible de marquer la recette.');
    }
  };

  const quickDeleteMyRecipe = async (recipe) => {
    const msg = 'Supprimer cette recette ?\n\nCette action est définitive.';
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(window.confirm(msg))
      : new Promise((resolve) => {
          Alert.alert('Supprimer cette recette ?', 'Cette action est définitive.', [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
          ]);
        }));
    if (!ok) return;
    const prev = myRecipes;
    setMyRecipes((p) => p.filter((r) => r.id !== recipe.id));
    const { error: delError } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipe.id);
    if (delError) {
      setMyRecipes(prev);
      notify('Suppression impossible', delError.message);
    }
  };

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
      // Compteur cloche + mes recettes (indépendants du loader principal)
      loadUrgent();
      loadMyRecipes();
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
    }, [load, loadUrgent, loadMyRecipes])
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
            <View style={styles.headerRightGroup}>
              <NotificationBell
                urgentCount={urgentCount}
                onPress={() =>
                  navigation.navigate('Frigo', { screen: 'FridgeList' })
                }
              />
              <Pressable
                onPress={() => navigation.navigate('Profile')}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.avatar,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Ouvrir mon profil"
              >
                <Text style={styles.avatarText}>{initial}</Text>
              </Pressable>
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

        {/* MES RECETTES (code original restauré : SwipeableCard + RecipeCardContent) */}
        {user && (
          <>
            <Text style={styles.sectionH}>⭐ Mes recettes</Text>
            {loading ? null : myRecipes.length === 0 ? (
              <View style={styles.myEmpty}>
                <Text style={styles.myEmptyEmoji}>🍳</Text>
                <Text style={styles.myEmptyTitle}>
                  Aucune recette pour le moment
                </Text>
                <Text style={styles.myEmptyHint}>
                  Appuie sur + pour en créer une ou la générer via IA
                </Text>
              </View>
            ) : (
              <View style={styles.myListContent}>
                {myRecipes.map((item, index) => (
                  <FadeInView
                    key={item.id}
                    delay={Math.min(index * 60, 600)}
                    style={styles.myCardWrap}
                  >
                    <SwipeableCard
                      id={item.id}
                      openCardId={openCardId}
                      onOpenChange={setOpenCardId}
                      onDelete={() => quickDeleteMyRecipe(item)}
                      onMarkCooked={() => handleQuickCooked(item)}
                      onPress={() =>
                        navigation.navigate('RecipeDetail', { recipe: item })
                      }
                      confirmTitle="Supprimer cette recette ?"
                      confirmMessage="Cette action est définitive."
                      borderRadius={16}
                    >
                      <View style={styles.myCard}>
                        <RecipeCardContent
                          recipe={item}
                          styles={styles}
                          colors={colors}
                        />
                      </View>
                    </SwipeableCard>
                  </FadeInView>
                ))}
              </View>
            )}
          </>
        )}
      </WebScroll>

      <TutorialModal
        visible={tutorialOpen}
        showWelcome
        onClose={closeTutorial}
      />

      {user ? (
        <Pressable
          onPress={() => setCreateModalVisible(true)}
          style={({ pressed }) => [
            styles.createFab,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
          ]}
          accessibilityLabel="Créer une recette"
          accessibilityRole="button"
        >
          <Text style={styles.createFabIcon}>+</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <Pressable
          style={styles.createModalOverlay}
          onPress={() => setCreateModalVisible(false)}
        >
          <Pressable
            style={[
              styles.createModalContent,
              { backgroundColor: colors.surface },
            ]}
            onPress={(e) => {
              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            }}
          >
            <View
              style={[
                styles.createModalHandle,
                { backgroundColor: colors.border },
              ]}
            />
            <Text style={[styles.createModalTitle, { color: colors.text }]}>
              Créer une recette
            </Text>

            <Pressable
              onPress={() => {
                setCreateModalVisible(false);
                navigation.navigate('IA');
              }}
              style={({ pressed }) => [
                styles.createOption,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.createOptionEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.createOptionTitle, { color: colors.text }]}>
                  Générer avec l'IA
                </Text>
                <Text style={[styles.createOptionDesc, { color: colors.textSecondary }]}>
                  Laisse notre IA créer une recette à partir de ton frigo
                </Text>
              </View>
              <Text style={[styles.createOptionChevron, { color: colors.textSecondary }]}>
                ›
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setCreateModalVisible(false);
                navigation.navigate('AddRecipe');
              }}
              style={({ pressed }) => [
                styles.createOption,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.createOptionEmoji}>✏️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.createOptionTitle, { color: colors.text }]}>
                  Créer manuellement
                </Text>
                <Text style={[styles.createOptionDesc, { color: colors.textSecondary }]}>
                  Ajoute ta propre recette (nom, ingrédients, étapes)
                </Text>
              </View>
              <Text style={[styles.createOptionChevron, { color: colors.textSecondary }]}>
                ›
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setCreateModalVisible(false);
                setSuggestModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.createOption,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.createOptionEmoji}>💡</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.createOptionTitle, { color: colors.text }]}>
                  Suggérer au catalogue
                </Text>
                <Text style={[styles.createOptionDesc, { color: colors.textSecondary }]}>
                  Propose une recette que tu aimerais voir dans les populaires
                </Text>
              </View>
              <Text style={[styles.createOptionChevron, { color: colors.textSecondary }]}>
                ›
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setCreateModalVisible(false)}
              style={styles.createModalCancel}
            >
              <Text
                style={[
                  styles.createModalCancelText,
                  { color: colors.textSecondary },
                ]}
              >
                Annuler
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <SuggestRecipeModal
        visible={suggestModalVisible}
        onClose={() => setSuggestModalVisible(false)}
        onSubmit={handleSuggestSubmit}
        colors={colors}
        styles={styles}
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
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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

  // Mes recettes (code original restauré depuis l'ancien RecipesScreen)
  myListContent: {
    paddingHorizontal: 16,
    paddingBottom: spacing.md,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    alignSelf: 'center',
  },
  myCardWrap: {
    width: '100%',
    maxWidth: maxContentWidth,
  },
  myCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    position: 'relative',
  },
  myTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  myTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  myVeganBadge: {
    backgroundColor: colors.successLight,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  myVeganBadgeText: { fontSize: 14 },
  myAiBadge: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  myAiBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  myTrashHit: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myTrashIcon: { fontSize: 16, fontWeight: '600', lineHeight: 18 },
  myDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  myMeta: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  myBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  myBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  myBadgeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  myEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  myEmptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  myEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  myEmptyHint: {
    fontSize: 12,
    color: colors.textHint,
    marginTop: 4,
    textAlign: 'center',
  },

  // FAB flottant en bas à droite
  createFab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  createFabIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 34,
    marginTop: -2,
  },

  // Modal création (bottom sheet avec 3 options)
  createModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  createModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
  createModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  createModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  createOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  createOptionEmoji: {
    fontSize: 28,
  },
  createOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  createOptionDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  createOptionChevron: {
    fontSize: 22,
    fontWeight: '600',
  },
  createModalCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  createModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Modal suggestion de recette
  suggestModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '90%',
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
  suggestTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  suggestSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  suggestLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  suggestInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  suggestInputMultiline: {
    minHeight: 70,
    paddingTop: 10,
  },
  suggestActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  suggestBtnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  suggestBtnPrimary: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
