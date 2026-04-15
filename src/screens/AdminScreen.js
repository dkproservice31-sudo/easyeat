import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import WebScroll from '../components/WebScroll';
import RecipeEmoji from '../components/RecipeEmoji';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { generateRecipesBatch } from '../lib/ai';
import { formatDateFr } from '../lib/dateFr';
import { formatDuration } from '../lib/formatDuration';
import { useTheme } from '../contexts/ThemeContext';
import { maxContentWidth, spacing } from '../theme/theme';

const BASE_CUISINES = ['française', 'italienne', 'espagnole'];

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
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export default function AdminScreen() {
  const { user, isAdmin, isEditor, loading: authLoading } = useAuth();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [recipes, setRecipes] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberRecipeCounts, setMemberRecipeCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCuisine, setSelectedCuisine] = useState('française');
  const [memberQuery, setMemberQuery] = useState('');
  const [activeTab, setActiveTab] = useState('recipes'); // 'recipes' | 'members'

  // Ajouter un pays
  const [adding, setAdding] = useState(false);
  const [newCuisine, setNewCuisine] = useState('');

  // Générer avec IA
  const [genOpen, setGenOpen] = useState(false);
  const [genCount, setGenCount] = useState('10');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isEditor) {
      navigation.navigate('MainTabs');
    }
  }, [authLoading, user, isEditor, navigation]);

  const load = useCallback(async () => {
    // Recettes featured : tous les éditeurs peuvent lire
    const { data: recipesData } = await supabase
      .from('recipes')
      .select('id, title, cuisine, duration, servings, featured, published')
      .eq('featured', true)
      .order('title', { ascending: true });
    setRecipes(recipesData ?? []);

    // Membres + stats : uniquement l'admin
    if (isAdmin) {
      const [membersRes, userRecipesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, username, email, first_name, last_name, age, created_at, role'
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('recipes')
          .select('user_id')
          .or('featured.is.null,featured.eq.false'),
      ]);
      setMembers(
        (membersRes.data ?? []).filter((m) => m.role !== 'admin')
      );
      const counts = {};
      for (const r of userRecipesRes.data ?? []) {
        counts[r.user_id] = (counts[r.user_id] || 0) + 1;
      }
      setMemberRecipeCounts(counts);
    } else {
      setMembers([]);
      setMemberRecipeCounts({});
    }
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (!isEditor) return;
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [isEditor, load])
  );

  // Liste des cuisines existantes (unique) + les 3 bases
  const allCuisines = useMemo(() => {
    const set = new Set(BASE_CUISINES);
    for (const r of recipes) if (r.cuisine) set.add(r.cuisine);
    return Array.from(set);
  }, [recipes]);

  const countsByCuisine = useMemo(() => {
    const c = {};
    for (const r of recipes) {
      const k = r.cuisine || 'autre';
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [recipes]);

  const recipesInCuisine = useMemo(
    () => recipes.filter((r) => r.cuisine === selectedCuisine),
    [recipes, selectedCuisine]
  );

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const hay = `${m.first_name || ''} ${m.last_name || ''} ${m.username || ''} ${m.email || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [members, memberQuery]);

  const onChangeMemberRole = async (member, newRole) => {
    const action =
      newRole === 'editor' ? 'Promouvoir en éditeur' : 'Rétrograder en membre';
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(window.confirm(`${action} ?\n\n${member.first_name || member.username}`))
      : new Promise((resolve) => {
          Alert.alert(action, member.first_name || member.username, [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirmer', onPress: () => resolve(true) },
          ]);
        }));
    if (!ok) return;
    const prev = members;
    setMembers((p) =>
      p.map((x) => (x.id === member.id ? { ...x, role: newRole } : x))
    );
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', member.id);
    if (error) {
      setMembers(prev);
      notify('Mise à jour impossible', error.message);
    }
  };

  const onTogglePublished = async (recipe) => {
    const next = !recipe.published;
    // Optimistic
    setRecipes((p) =>
      p.map((x) => (x.id === recipe.id ? { ...x, published: next } : x))
    );
    const { error } = await supabase
      .from('recipes')
      .update({ published: next })
      .eq('id', recipe.id);
    if (error) {
      setRecipes((p) =>
        p.map((x) =>
          x.id === recipe.id ? { ...x, published: recipe.published } : x
        )
      );
      notify('Mise à jour impossible', error.message);
    }
  };

  const onDeleteRecipe = async (recipe) => {
    const ok = await confirmDialog(
      `Supprimer "${recipe.title}" ?`,
      'Cette action est définitive.'
    );
    if (!ok) return;
    const prev = recipes;
    setRecipes((p) => p.filter((r) => r.id !== recipe.id));
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipe.id);
    if (error) {
      setRecipes(prev);
      notify('Suppression impossible', error.message);
    }
  };

  const onAddCuisine = () => {
    const name = newCuisine.trim().toLowerCase();
    if (!name) return;
    setSelectedCuisine(name);
    setNewCuisine('');
    setAdding(false);
  };

  const runGenerate = async () => {
    const n = parseInt(genCount, 10);
    if (isNaN(n) || n < 1 || n > 50) {
      return notify('Oops', 'Choisissez entre 1 et 50 recettes.');
    }
    setGenerating(true);
    setGenProgress({ done: 0, total: n });
    try {
      // Récupère les titres existants pour cette cuisine (toutes featured, publiées ou non)
      const { data: existingRows } = await supabase
        .from('recipes')
        .select('title')
        .eq('featured', true)
        .eq('cuisine', selectedCuisine);
      const existingTitles = (existingRows ?? [])
        .map((r) => r.title)
        .filter(Boolean);

      const { recipes: generated, skipped: skippedFromPrompt } =
        await generateRecipesBatch({
          cuisine: selectedCuisine,
          count: n,
          existingTitles,
          onProgress: (done, total) => setGenProgress({ done, total }),
        });

      // Deuxième filtre de sécurité (au cas où Gemini renvoie quand même un doublon)
      const existingSet = new Set(
        existingTitles.map((t) => t.trim().toLowerCase())
      );
      const seen = new Set();
      const unique = [];
      let clientSkipped = 0;
      for (const r of generated) {
        const key = (r.title || '').trim().toLowerCase();
        if (!key) continue;
        if (existingSet.has(key) || seen.has(key)) {
          clientSkipped++;
          continue;
        }
        seen.add(key);
        unique.push(r);
      }

      const totalSkipped = skippedFromPrompt + clientSkipped;

      if (unique.length === 0) {
        notify(
          'Aucune nouvelle recette',
          totalSkipped > 0
            ? `${totalSkipped} recette${totalSkipped > 1 ? 's' : ''} ignorée${totalSkipped > 1 ? 's' : ''} (déjà existante${totalSkipped > 1 ? 's' : ''}).`
            : 'Réessayez plus tard.'
        );
        return;
      }

      const rows = unique.map((r) => ({
        user_id: user.id,
        title: r.title,
        description: r.description || null,
        ingredients: r.ingredients || null,
        steps: r.steps || null,
        servings: r.servings || 2,
        duration: r.duration || null,
        cooking_temp:
          r.cooking_temp && r.cooking_temp > 0 ? r.cooking_temp : null,
        cooking_type: r.cooking_type || null,
        fat_type: r.fat_type || null,
        cuisine: selectedCuisine,
        featured: true,
        generated_by_ai: true,
      }));
      const { error } = await supabase.from('recipes').insert(rows);
      if (error) {
        notify('Insertion échouée', error.message);
        return;
      }
      const skippedMsg =
        totalSkipped > 0
          ? ` (${totalSkipped} ignorée${totalSkipped > 1 ? 's' : ''} car déjà existante${totalSkipped > 1 ? 's' : ''})`
          : '';
      notify(
        'Succès',
        `${rows.length} recette${rows.length > 1 ? 's' : ''} ajoutée${rows.length > 1 ? 's' : ''} au catalogue${skippedMsg}.`
      );
      setGenOpen(false);
      await load();
    } catch (err) {
      notify('Génération impossible', err.message || 'Erreur');
    } finally {
      setGenerating(false);
    }
  };

  if (!isEditor) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WebScroll
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
      >
        {/* TABS NAVIGATION */}
        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setActiveTab('recipes')}
            style={({ pressed }) => [
              styles.tabBtn,
              activeTab === 'recipes' && styles.tabBtnActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'recipes' && styles.tabBtnTextActive,
              ]}
            >
              🍽️ Recettes ({recipes.length})
            </Text>
          </Pressable>
          {isAdmin && (
            <Pressable
              onPress={() => setActiveTab('members')}
              style={({ pressed }) => [
                styles.tabBtn,
                activeTab === 'members' && styles.tabBtnActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'members' && styles.tabBtnTextActive,
                ]}
              >
                👥 Membres ({members.length})
              </Text>
            </Pressable>
          )}
        </View>

        {activeTab === 'recipes' && (
          <>
        {/* CUISINES CHIPS */}
        <Text style={styles.sectionTitle}>Recettes par pays</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsScroll}
        >
          {allCuisines.map((c) => {
            const active = selectedCuisine === c;
            return (
              <Pressable
                key={c}
                onPress={() => setSelectedCuisine(c)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {c} ({countsByCuisine[c] || 0})
                </Text>
              </Pressable>
            );
          })}
          {adding ? (
            <View style={styles.addCuisineRow}>
              <TextInput
                value={newCuisine}
                onChangeText={setNewCuisine}
                placeholder="nom du pays"
                placeholderTextColor={colors.textHint}
                style={styles.addCuisineInput}
                autoFocus
                onSubmitEditing={onAddCuisine}
                maxLength={30}
              />
              <Pressable onPress={onAddCuisine} style={styles.addCuisineBtn}>
                <Text style={styles.addCuisineBtnText}>OK</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAdding(false);
                  setNewCuisine('');
                }}
                style={styles.addCuisineCancel}
              >
                <Text style={styles.addCuisineCancelText}>×</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setAdding(true)}
              style={({ pressed }) => [
                styles.chip,
                styles.addChip,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.chipText}>+ Ajouter un pays</Text>
            </Pressable>
          )}
        </ScrollView>

        {/* COUNTRY HEADER */}
        <View style={styles.countryHeader}>
          <Text style={styles.countryCount}>
            {recipesInCuisine.length} recette
            {recipesInCuisine.length > 1 ? 's' : ''} {selectedCuisine}
          </Text>
          <Pressable
            onPress={() =>
              navigation.navigate('AdminEditFeatured', {
                recipe: null,
                presetCuisine: selectedCuisine,
              })
            }
            style={({ pressed }) => [
              styles.smallBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.smallBtnText}>+ Ajouter</Text>
          </Pressable>
        </View>

        {/* GENERATE AI */}
        {!genOpen ? (
          <Pressable
            onPress={() => setGenOpen(true)}
            style={({ pressed }) => [
              styles.generateBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.generateBtnText}>
              ✨ Générer des recettes avec l'IA
            </Text>
          </Pressable>
        ) : (
          <View style={styles.generateBox}>
            <Text style={styles.generateTitle}>
              Générer des recettes {selectedCuisine}
            </Text>
            <Text style={styles.genLabel}>Nombre de recettes</Text>
            <TextInput
              value={genCount}
              onChangeText={setGenCount}
              keyboardType="number-pad"
              maxLength={2}
              editable={!generating}
              style={styles.genInput}
              placeholder="10"
              placeholderTextColor={colors.textHint}
            />
            {generating && (
              <View style={styles.progress}>
                <Text style={styles.progressText}>
                  {genProgress.done} / {genProgress.total} générées...
                </Text>
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginTop: 8 }}
                />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={runGenerate}
                disabled={generating}
                style={({ pressed }) => [
                  styles.genSubmitBtn,
                  (generating) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.genSubmitText}>
                  {generating ? 'Génération...' : 'Générer'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setGenOpen(false)}
                disabled={generating}
                style={({ pressed }) => [
                  styles.genCancelBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.genCancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* RECIPES LIST */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : recipesInCuisine.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune recette pour ce pays.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {recipesInCuisine.map((r) => (
              <View key={r.id} style={styles.row}>
                <RecipeEmoji title={r.title} size={26} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {r.duration ? formatDuration(r.duration) : '—'}
                    {r.servings ? ` · ${r.servings} pers.` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onTogglePublished(r)}
                  style={({ pressed }) => [
                    styles.publishedBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel={
                    r.published ? 'Dépublier' : 'Publier'
                  }
                  hitSlop={6}
                >
                  <Text style={styles.publishedDot}>
                    {r.published ? '🟢' : '🔴'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    navigation.navigate('AdminEditFeatured', { recipe: r })
                  }
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { backgroundColor: colors.primaryLight },
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityLabel="Modifier"
                >
                  <Text style={[styles.iconBtnText, { color: colors.primary }]}>
                    ✎
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onDeleteRecipe(r)}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { backgroundColor: colors.dangerLight },
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityLabel="Supprimer"
                >
                  <Text style={[styles.iconBtnText, { color: colors.danger }]}>
                    ×
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
          </>
        )}

        {/* MEMBERS — onglet Membres, admin uniquement */}
        {activeTab === 'members' && isAdmin && (
          <>
            <Text style={styles.sectionTitle}>
              Membres ({members.length})
            </Text>

            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                value={memberQuery}
                onChangeText={setMemberQuery}
                placeholder="Rechercher un membre..."
                placeholderTextColor={colors.textHint}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {filteredMembers.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {memberQuery
                    ? 'Aucun membre trouvé.'
                    : 'Aucun membre inscrit.'}
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {filteredMembers.map((m) => {
                  const isMember = m.role === 'member';
                  const isEditorMember = m.role === 'editor';
                  return (
                    <View key={m.id} style={styles.memberCard}>
                      <View style={styles.memberHeader}>
                        <Text style={styles.memberName}>
                          {(m.first_name || '') + ' ' + (m.last_name || '')}
                        </Text>
                        <View
                          style={[
                            styles.roleBadge,
                            isEditorMember && styles.roleBadgeEditor,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeText,
                              isEditorMember && styles.roleBadgeTextEditor,
                            ]}
                          >
                            {isEditorMember ? 'Éditeur' : 'Membre'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.memberInfo}>
                        @{m.username || '—'} · {m.email || ''}
                      </Text>
                      <View style={styles.memberMetaRow}>
                        {m.age ? (
                          <Text style={styles.memberMeta}>{m.age} ans</Text>
                        ) : null}
                        <Text style={styles.memberMeta}>
                          Inscrit le {formatDateFr(m.created_at)}
                        </Text>
                      </View>
                      <Text style={styles.memberMeta}>
                        📖 {memberRecipeCounts[m.id] || 0} recette
                        {(memberRecipeCounts[m.id] || 0) > 1 ? 's' : ''}
                      </Text>

                      {isMember && (
                        <Pressable
                          onPress={() => onChangeMemberRole(m, 'editor')}
                          style={({ pressed }) => [
                            styles.roleBtn,
                            styles.roleBtnPromote,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.roleBtnPromoteText}>
                            ⬆️ Promouvoir Éditeur
                          </Text>
                        </Pressable>
                      )}
                      {isEditorMember && (
                        <Pressable
                          onPress={() => onChangeMemberRole(m, 'member')}
                          style={({ pressed }) => [
                            styles.roleBtn,
                            styles.roleBtnDemote,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.roleBtnDemoteText}>
                            ⬇️ Rétrograder Membre
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </WebScroll>
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    paddingBottom: 40,
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },

  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  tabBtnActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabBtnTextActive: { color: colors.primary },

  // Chips
  chipsScroll: { marginHorizontal: -16 },
  chipsContent: {
    gap: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 4,
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
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  addChip: { borderStyle: 'dashed', borderColor: colors.primary },
  addCuisineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addCuisineInput: {
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    minWidth: 140,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  addCuisineBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCuisineBtnText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  addCuisineCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCuisineCancelText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -2,
  },

  // Country header
  countryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  countryCount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  smallBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallBtnText: { color: colors.surface, fontSize: 13, fontWeight: '700' },

  // Generate AI
  generateBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 50,
  },
  generateBtnText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  generateBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  generateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  genLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  genInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    maxWidth: 140,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  progress: {
    marginTop: 12,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
  },
  genSubmitBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genSubmitText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  genCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genCancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },

  // Search
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
    marginBottom: 12,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },

  // Recipe / member rows
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16, fontWeight: '700' },
  publishedBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishedDot: { fontSize: 14 },

  // Member card
  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  memberInfo: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  memberMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  memberMeta: { fontSize: 12, color: colors.textSecondary },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  roleBadgeEditor: { backgroundColor: colors.primaryLight },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  roleBadgeTextEditor: { color: colors.primary },
  roleBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBtnPromote: { backgroundColor: colors.primaryLight },
  roleBtnPromoteText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  roleBtnDemote: { backgroundColor: colors.dangerLight },
  roleBtnDemoteText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },

  empty: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyText: { fontSize: 14, color: colors.textSecondary },
});
