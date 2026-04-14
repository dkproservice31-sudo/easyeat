import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateTimeFr } from '../lib/dateFr';
import {
  parseIngredients,
  cleanIngredientName,
  findInFridge,
} from '../lib/ingredients';
import {
  colors,
  radius,
  spacing,
  typography,
  maxContentWidth,
} from '../theme/theme';

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

function ShoppingItemRow({ item, checked, onToggle }) {
  return (
    <Pressable
      onPress={() => onToggle(item.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={item.name}
    >
      <View style={[styles.circle, checked && styles.circleChecked]}>
        {checked && <View style={styles.circleDot} />}
      </View>
      <Text
        style={[styles.name, checked && styles.nameChecked]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
      <Text style={[styles.qtyText, checked && styles.nameChecked]}>
        {item.unit}
      </Text>
    </Pressable>
  );
}

// Carte d'une recette avec statut de chaque ingrédient vis-à-vis du frigo
function RecipeCard({ recipe, fridge, onAddAll, adding }) {
  const lines = parseIngredients(recipe.ingredients);
  const items = lines.map((raw) => {
    const clean = cleanIngredientName(raw) || raw;
    const match = findInFridge(clean, fridge);
    const inStock = match && Number(match.quantity) > 0;
    return { raw, clean, inStock };
  });
  const missing = items.filter((i) => !i.inStock);

  return (
    <View style={styles.recipeCard}>
      <Text style={styles.recipeTitle} numberOfLines={2}>
        {recipe.title}
      </Text>

      {items.length === 0 ? (
        <Text style={[typography.small, { marginTop: spacing.sm }]}>
          Aucun ingrédient listé.
        </Text>
      ) : (
        <View style={styles.ingWrap}>
          {items.map((it, i) => (
            <View
              key={i}
              style={[
                styles.ingChip,
                it.inStock ? styles.ingInStock : styles.ingMissing,
              ]}
            >
              <Text
                style={[
                  styles.ingText,
                  it.inStock
                    ? { color: '#0A6E50' }
                    : { color: '#9A1B2A' },
                ]}
                numberOfLines={1}
              >
                {it.raw}
              </Text>
            </View>
          ))}
        </View>
      )}

      {missing.length > 0 && (
        <Pressable
          onPress={() => onAddAll(recipe, missing)}
          disabled={adding}
          style={({ pressed }) => [
            styles.addAllBtn,
            pressed && { opacity: 0.85 },
            adding && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.addAllText}>
            {adding ? '...' : `Tout ajouter au caddie (${missing.length})`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function FinishModal({ visible, onClose, onOk, onSave, busy }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable
          style={styles.modalBackdropTap}
          onPress={busy ? undefined : onClose}
        />
        <View style={styles.modalCard}>
          <Text style={typography.h2}>Terminer les courses</Text>
          <Text style={[typography.small, { marginTop: spacing.sm }]}>
            Les ingrédients cochés repasseront à 1 dans votre frigo.
          </Text>
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Pressable
              onPress={onOk}
              disabled={busy}
              style={({ pressed }) => [
                styles.modalBtn,
                { backgroundColor: colors.success },
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.modalBtnText}>OK</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={busy}
              style={({ pressed }) => [
                styles.modalBtn,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.modalBtnText}>Sauvegarder</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              disabled={busy}
              style={({ pressed }) => [
                styles.modalBtn,
                styles.modalBtnCancel,
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.5 },
              ]}
            >
              <Text style={[styles.modalBtnText, { color: colors.text }]}>
                Annuler
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function HistoryCard({ entry, onDelete }) {
  const count = Array.isArray(entry.items) ? entry.items.length : 0;
  return (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.historyDate}>
            {formatDateTimeFr(entry.created_at)}
          </Text>
          <Text style={styles.historyCount}>
            {count} ingrédient{count > 1 ? 's' : ''} acheté
            {count > 1 ? 's' : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => onDelete(entry)}
          style={({ pressed }) => [
            styles.historyDeleteBtn,
            pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] },
          ]}
          accessibilityLabel="Supprimer cet historique"
          hitSlop={8}
        >
          <Text style={styles.historyDeleteText}>🗑</Text>
        </Pressable>
      </View>
      <View style={styles.historyItems}>
        {(entry.items || []).map((it, i) => (
          <Text key={i} style={styles.historyItem}>
            • {it.name}
            {it.unit ? ` (${it.unit})` : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function ShoppingScreen() {
  const { user } = useAuth();
  const [fridge, setFridge] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [history, setHistory] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingRecipeId, setAddingRecipeId] = useState(null);

  const loadFridge = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('fridge_items')
      .select('*')
      .eq('user_id', user.id);
    setFridge(data ?? []);
  }, [user]);

  const loadRecipes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('recipes')
      .select('id, title, ingredients')
      .eq('user_id', user.id)
      .or('featured.is.null,featured.eq.false')
      .order('created_at', { ascending: false });
    setRecipes(data ?? []);
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('shopping_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory(data ?? []);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await Promise.all([loadFridge(), loadRecipes(), loadHistory()]);
        setLoading(false);
      })();
    }, [loadFridge, loadRecipes, loadHistory])
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`shopping-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fridge_items',
          filter: `user_id=eq.${user.id}`,
        },
        () => loadFridge()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadFridge]);

  const shoppingList = fridge.filter((f) => Number(f.quantity) === 0);

  const toggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFridge(), loadRecipes(), loadHistory()]);
    setRefreshing(false);
  };

  const completePurchase = async (saveToHistory) => {
    const checkedItems = shoppingList.filter((i) => checked.has(i.id));
    if (checkedItems.length === 0) {
      setModalOpen(false);
      return;
    }
    setBusy(true);

    if (saveToHistory) {
      const payload = checkedItems.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
      }));
      const { error: histError } = await supabase
        .from('shopping_history')
        .insert({ user_id: user.id, items: payload });
      if (histError) {
        setBusy(false);
        notify('Sauvegarde impossible', histError.message);
        return;
      }
    }

    const ids = checkedItems.map((i) => i.id);
    const { error } = await supabase
      .from('fridge_items')
      .update({ quantity: 1 })
      .in('id', ids);
    setBusy(false);

    if (error) return notify('Mise à jour impossible', error.message);

    setChecked(new Set());
    setModalOpen(false);
    await Promise.all([loadFridge(), loadHistory()]);
  };

  // Ajoute au frigo avec quantity=0 tous les ingrédients manquants d'une recette
  const addAllFromRecipe = async (recipe, missingItems) => {
    if (!user || missingItems.length === 0) return;
    setAddingRecipeId(recipe.id);

    // Dédupe par nom nettoyé pour éviter les doublons dans le batch
    const seen = new Set();
    const toInsert = [];
    for (const m of missingItems) {
      const name = m.clean || m.raw;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Ne pas réinsérer si une ligne avec qty=0 existe déjà (match partiel)
      const existing = findInFridge(name, fridge);
      if (existing && Number(existing.quantity) === 0) continue;
      // S'il existe avec qty > 0 on n'insère pas non plus (sinon doublon)
      if (existing && Number(existing.quantity) > 0) continue;
      toInsert.push({
        user_id: user.id,
        name,
        quantity: 0,
        unit: 'unité',
      });
    }

    if (toInsert.length === 0) {
      setAddingRecipeId(null);
      notify('Déjà au complet', 'Ces ingrédients sont déjà dans votre caddie.');
      return;
    }

    const { error } = await supabase.from('fridge_items').insert(toInsert);
    setAddingRecipeId(null);
    if (error) return notify('Ajout impossible', error.message);
    await loadFridge();
    notify(
      'Ajoutés au caddie',
      `${toInsert.length} ingrédient${toInsert.length > 1 ? 's ajoutés' : ' ajouté'}.`
    );
  };

  const deleteHistory = async (entry) => {
    const ok = await confirmDialog(
      'Supprimer cet historique ?',
      'Cette action est définitive.'
    );
    if (!ok) return;
    const prev = history;
    setHistory((p) => p.filter((h) => h.id !== entry.id));
    const { error } = await supabase
      .from('shopping_history')
      .delete()
      .eq('id', entry.id);
    if (error) {
      notify('Suppression impossible', error.message);
      setHistory(prev);
    }
  };

  const hasChecked = checked.size > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Text style={typography.h1}>Mes Courses</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Section 1 : ingrédients à acheter */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { marginBottom: 0, flex: 1 }]}>
              Mes ingrédients
            </Text>
            {shoppingList.length > 0 &&
              (() => {
                const allChecked =
                  shoppingList.length > 0 &&
                  shoppingList.every((i) => checked.has(i.id));
                return (
                  <Pressable
                    onPress={() => {
                      if (allChecked) {
                        setChecked(new Set());
                      } else {
                        setChecked(new Set(shoppingList.map((i) => i.id)));
                      }
                    }}
                    style={({ pressed }) => [
                      styles.toggleAllBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityLabel={
                      allChecked ? 'Tout désélectionner' : 'Tout sélectionner'
                    }
                  >
                    <Text style={styles.toggleAllText}>
                      {allChecked ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </Text>
                  </Pressable>
                );
              })()}
          </View>
          <Text style={styles.sectionHint}>
            {shoppingList.length} à acheter · {checked.size} dans le caddie
          </Text>
          {shoppingList.length === 0 ? (
            <View style={styles.empty}>
              <Text style={typography.small}>
                Aucune course à faire pour le moment.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {shoppingList.map((item) => (
                <ShoppingItemRow
                  key={item.id}
                  item={item}
                  checked={checked.has(item.id)}
                  onToggle={toggle}
                />
              ))}
            </View>
          )}

          {/* Section 2 : recettes et leurs ingrédients */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
            Mes recettes
          </Text>
          {recipes.length === 0 ? (
            <View style={styles.empty}>
              <Text style={typography.small}>
                Vous n'avez pas encore de recettes.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {recipes.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  fridge={fridge}
                  onAddAll={addAllFromRecipe}
                  adding={addingRecipeId === r.id}
                />
              ))}
            </View>
          )}

          {/* Historique */}
          {history.length > 0 && (
            <View style={styles.historyWrap}>
              <Text style={styles.historyTitle}>Historique des courses</Text>
              {history.map((h) => (
                <HistoryCard key={h.id} entry={h} onDelete={deleteHistory} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {shoppingList.length > 0 && (
        <View style={styles.footer}>
          <Pressable
            onPress={() => setModalOpen(true)}
            disabled={!hasChecked || busy}
            style={({ pressed }) => [
              styles.finishBtn,
              (!hasChecked || busy) && { opacity: 0.5 },
              pressed && hasChecked && { opacity: 0.85 },
            ]}
            accessibilityLabel="Terminer les courses"
          >
            <Text style={styles.finishBtnText}>
              Terminer les courses
              {hasChecked ? ` (${checked.size})` : ''}
            </Text>
          </Pressable>
        </View>
      )}

      <FinishModal
        visible={modalOpen}
        onClose={() => !busy && setModalOpen(false)}
        onOk={() => completePurchase(false)}
        onSave={() => completePurchase(true)}
        busy={busy}
      />
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 120,
    alignItems: 'center',
  },
  sectionTitle: {
    width: '100%',
    maxWidth: maxContentWidth,
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  sectionHeaderRow: {
    width: '100%',
    maxWidth: maxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  toggleAllBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: '#FFF1E8',
  },
  toggleAllText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHint: {
    width: '100%',
    maxWidth: maxContentWidth,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  empty: {
    width: '100%',
    maxWidth: maxContentWidth,
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  row: {
    width: '100%',
    maxWidth: maxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    minHeight: 56,
  },
  rowPressed: { opacity: 0.85 },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#C9C9C9',
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  circleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  nameChecked: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  qtyText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },

  // Carte recette
  recipeCard: {
    width: '100%',
    maxWidth: maxContentWidth,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: spacing.md,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  ingWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    width: '100%',
  },
  ingChip: {
    flexShrink: 1,
    maxWidth: '100%',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  ingInStock: {
    backgroundColor: '#E6F7EE',
    borderColor: '#0A6E50',
  },
  ingMissing: {
    backgroundColor: '#FDECEE',
    borderColor: '#9A1B2A',
  },
  ingText: { fontSize: 12, fontWeight: '600' },
  addAllBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  addAllText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },

  // Footer fixe
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  finishBtn: {
    width: '100%',
    maxWidth: maxContentWidth,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalBackdropTap: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    width: '100%',
    maxWidth: maxContentWidth,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalBtnCancel: { backgroundColor: '#E0E0E0' },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Historique
  historyWrap: {
    width: '100%',
    maxWidth: maxContentWidth,
    marginTop: spacing.xl,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  historyDate: { fontSize: 15, fontWeight: '700', color: colors.text },
  historyCount: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  historyItems: { marginTop: spacing.sm },
  historyItem: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  historyDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDECEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDeleteText: { fontSize: 16, color: colors.error },
});
