import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import SwipeableCard from '../components/SwipeableCard';
import FadeInView from '../components/FadeInView';
import { useTheme } from '../contexts/ThemeContext';
import { radius, spacing, maxContentWidth } from '../theme/theme';
import { getIngredientEmoji } from '../lib/ingredientEmoji';
import ExpirationBadge from '../components/ExpirationBadge';
import ExpirationAlertBanner from '../components/ExpirationAlertBanner';
import {
  getExpirationLabel,
  getExpirationStatus,
  getExpirationColor,
  computeShelfLifeDays,
} from '../lib/expirationStatus';

const UNITS = ['g', 'kg', 'L', 'ml', 'unité'];

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

function FridgeRowContent({ item, onChangeQty, onEdit, styles, colors }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.quantity != null ? String(item.quantity) : '');

  const save = () => {
    setEditing(false);
    const trimmed = draft.trim();
    // Si champ vide → on remet null (quantity optionnelle retirée)
    if (trimmed === '') {
      if (item.quantity != null) onChangeQty(item, null);
      return;
    }
    const n = Number(trimmed.replace(',', '.'));
    if (isNaN(n) || n < 0) {
      // Reset draft à la valeur actuelle
      setDraft(item.quantity != null ? String(item.quantity) : '');
      return;
    }
    // Comparaison qui gère le cas null
    const current = item.quantity == null ? null : Number(item.quantity);
    if (n !== current) onChangeQty(item, n);
  };

  const expirationLabel = getExpirationLabel(item);
  const expirationColor =
    getExpirationColor(getExpirationStatus(item)) || colors.textSecondary;

  return (
    <View style={styles.card}>
      <ExpirationBadge item={item} compact />
      <Text style={styles.cardEmoji}>
        {getIngredientEmoji(item.name)}
      </Text>
      <View style={styles.cardTextCol}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.name}
        </Text>
        {expirationLabel ? (
          <Text style={[styles.expirationLabel, { color: expirationColor }]}>
            {expirationLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.qtyWrap}>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={save}
            onSubmitEditing={save}
            keyboardType="decimal-pad"
            style={styles.qtyInput}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            placeholder=""
          />
        ) : item.quantity != null ? (
          <Pressable
            onPress={() => {
              setDraft(String(item.quantity));
              setEditing(true);
            }}
            hitSlop={6}
            style={styles.qtyBadge}
          >
            <Text style={styles.qtyBadgeText}>{item.quantity}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              setDraft('');
              setEditing(true);
            }}
            hitSlop={6}
            style={styles.qtyAddBtn}
          >
            <Text style={styles.qtyAddText}>+</Text>
          </Pressable>
        )}
        {item.quantity != null && (
          <Text style={styles.unitText}>{item.unit}</Text>
        )}
      </View>

      <Pressable
        onPress={() => onEdit && onEdit(item)}
        hitSlop={10}
        style={({ pressed }) => [
          styles.editBtn,
          pressed && { opacity: 0.5 },
        ]}
        accessibilityLabel="Modifier cet ingrédient"
      >
        <Text style={styles.editIcon}>✏️</Text>
      </Pressable>
    </View>
  );
}

function AddItemModal({ visible, onClose, onAdd, styles, colors }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('unité');
  const [expirationDate, setExpirationDate] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setQty('');
    setUnit('unité');
    setExpirationDate(null);
  };

  const submit = async () => {
    if (!name.trim()) return;
    // Quantité optionnelle : si vide ou invalide → null
    let quantity = null;
    if (qty.trim() !== '') {
      const n = Number(qty.replace(',', '.'));
      if (!isNaN(n) && n >= 0) {
        quantity = n;
      }
    }
    setSaving(true);
    const ok = await onAdd({
      name: name.trim(),
      quantity,
      unit,
      expiration_date: expirationDate,
    });
    setSaving(false);
    if (ok) {
      reset();
      onClose();
    }
  };

  const todayISO = new Date().toISOString().split('T')[0];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <Pressable style={styles.modalBackdropTap} onPress={onClose} />
        <View style={styles.modalCard}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>Nouvel ingrédient</Text>

            <Text style={styles.fieldLabel}>Nom</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Tomates, œufs, lait..."
              placeholderTextColor={colors.textHint}
              style={styles.modalInput}
              autoFocus
              maxLength={60}
            />

            <Text style={styles.fieldLabel}>Quantité</Text>
            <TextInput
              value={qty}
              onChangeText={setQty}
              placeholder="Optionnel"
              placeholderTextColor={colors.textHint}
              keyboardType="decimal-pad"
              style={styles.modalInput}
              maxLength={8}
            />

            <Text style={styles.fieldLabel}>Unité</Text>
            <View style={styles.unitRow}>
              {UNITS.map((u) => {
                const active = unit === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => setUnit(u)}
                    style={({ pressed }) => [
                      styles.unitChip,
                      active && styles.unitChipActive,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        active && styles.unitChipTextActive,
                      ]}
                    >
                      {u}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Date de péremption (optionnel)</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.dateRow}>
                <input
                  type="date"
                  value={expirationDate || ''}
                  onChange={(e) => setExpirationDate(e.target.value || null)}
                  min={todayISO}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 10,
                    border: `0.5px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    fontSize: 15,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                {expirationDate ? (
                  <Pressable
                    onPress={() => setExpirationDate(null)}
                    style={({ pressed }) => [
                      styles.dateClearBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    hitSlop={6}
                    accessibilityLabel="Retirer la date"
                  >
                    <Text style={styles.dateClearText}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.dateNativeHint, { color: colors.textSecondary }]}>
                Bientôt disponible sur mobile natif
              </Text>
            )}

            <View style={styles.modalActions}>
              <Pressable
                onPress={submit}
                disabled={!name.trim() || saving}
                style={({ pressed }) => [
                  styles.modalAddBtn,
                  (!name.trim() || saving) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalAddText}>
                  {saving ? '...' : 'Ajouter'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                disabled={saving}
                style={({ pressed }) => [
                  styles.modalCancelBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditItemModal({ visible, item, onClose, onSave, onDelete, colors, styles }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('unité');
  const [expirationDate, setExpirationDate] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.name || '');
    setQty(item.quantity == null ? '' : String(item.quantity));
    setUnit(item.unit || 'unité');
    setExpirationDate(item.expiration_date || null);
    setSaving(false);
  }, [item]);

  if (!item) return null;

  const todayISO = new Date().toISOString().split('T')[0];

  const handleSave = async () => {
    if (!name.trim()) return;
    let quantity = null;
    if (qty.trim() !== '') {
      const n = Number(qty.replace(',', '.'));
      if (!isNaN(n) && n >= 0) quantity = n;
    }
    const shelf_life_days = expirationDate
      ? computeShelfLifeDays(expirationDate)
      : null;

    setSaving(true);
    await onSave(item.id, {
      name: name.trim(),
      quantity,
      unit,
      expiration_date: expirationDate,
      shelf_life_days,
    });
    setSaving(false);
    onClose();
  };

  const handleDelete = () => {
    onClose();
    onDelete(item);
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
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdropTap} onPress={onClose} />
        <View style={styles.editModalContent}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.editModalTitle}>Modifier l'ingrédient</Text>

            <Text style={styles.fieldLabel}>Nom</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex: Tomates"
              placeholderTextColor={colors.textHint}
              style={styles.modalInput}
              maxLength={60}
            />

            <Text style={styles.fieldLabel}>Quantité (optionnel)</Text>
            <TextInput
              value={qty}
              onChangeText={setQty}
              placeholder="Optionnel"
              placeholderTextColor={colors.textHint}
              keyboardType="decimal-pad"
              style={styles.modalInput}
              maxLength={8}
            />

            <Text style={styles.fieldLabel}>Unité</Text>
            <View style={styles.unitRow}>
              {UNITS.map((u) => {
                const active = unit === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => setUnit(u)}
                    style={({ pressed }) => [
                      styles.unitChip,
                      active && styles.unitChipActive,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        active && styles.unitChipTextActive,
                      ]}
                    >
                      {u}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Date de péremption (optionnel)</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.dateRow}>
                <input
                  type="date"
                  value={expirationDate || ''}
                  onChange={(e) => setExpirationDate(e.target.value || null)}
                  min={todayISO}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 10,
                    border: `0.5px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    fontSize: 15,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                {expirationDate ? (
                  <Pressable
                    onPress={() => setExpirationDate(null)}
                    style={({ pressed }) => [
                      styles.dateClearBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    hitSlop={6}
                    accessibilityLabel="Retirer la date"
                  >
                    <Text style={styles.dateClearText}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.dateNativeHint, { color: colors.textSecondary }]}>
                Bientôt disponible sur mobile natif
              </Text>
            )}

            <View style={styles.editModalActions}>
              <Pressable
                onPress={handleDelete}
                disabled={saving}
                style={({ pressed }) => [
                  styles.editModalBtnDanger,
                  pressed && { opacity: 0.7 },
                  saving && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.editModalBtnDangerText}>🗑  Supprimer</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={onClose}
                disabled={saving}
                style={({ pressed }) => [
                  styles.editModalBtnSecondary,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.editModalBtnSecondaryText}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving || !name.trim()}
                style={({ pressed }) => [
                  styles.editModalBtnPrimary,
                  pressed && { opacity: 0.85 },
                  (saving || !name.trim()) && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.editModalBtnPrimaryText}>
                  {saving ? '...' : 'Enregistrer'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function FridgeListScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [openCardId, setOpenCardId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null);
  const scrollToId = route.params?.scrollToId;

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('fridge_items')
      .select('*')
      .eq('user_id', user.id)
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (!error) setItems(data ?? []);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const addItem = async ({ name, quantity, unit, expiration_date }) => {
    if (!user) return false;
    const payload = { user_id: user.id, name, unit };
    if (quantity !== null && quantity !== undefined) {
      payload.quantity = quantity;
    }
    if (expiration_date) {
      payload.expiration_date = expiration_date;
    }
    const { data, error } = await supabase
      .from('fridge_items')
      .insert(payload)
      .select('*')
      .single();
    if (error) {
      notify('Ajout impossible', error.message);
      return false;
    }
    // Ré-injecte en respectant le tri (expiration_date asc NULLS LAST,
    // puis created_at desc). Plus simple : on délègue à `load()`.
    await load();
    return true;
  };

  const changeQty = async (item, quantity) => {
    setItems((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, quantity } : x))
    );
    const { error } = await supabase
      .from('fridge_items')
      .update({ quantity })
      .eq('id', item.id);
    if (error) {
      notify('Mise à jour impossible', error.message);
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id ? { ...x, quantity: item.quantity } : x
        )
      );
    }
  };

  const performSupabaseDelete = async (item) => {
    const { error } = await supabase
      .from('fridge_items')
      .delete()
      .eq('id', item.id);
    if (error) {
      notify('Suppression impossible', error.message);
      setItems((prev) => [item, ...prev]);
    }
  };

  const openItemEditor = (item) => setEditingItem(item);
  const closeItemEditor = () => setEditingItem(null);

  const saveItem = async (itemId, updates) => {
    if (!user) return;

    const payload = {
      name: updates.name,
      unit: updates.unit,
      quantity: updates.quantity,
      expiration_date: updates.expiration_date,
      shelf_life_days: updates.shelf_life_days,
    };

    // Optimistic update
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, ...payload } : it))
    );

    const { error } = await supabase
      .from('fridge_items')
      .update(payload)
      .eq('id', itemId);

    if (error) {
      notify('Modification impossible', error.message);
      await load();
      return;
    }

    // Re-tri après modif (expiration_date peut avoir changé)
    await load();
  };

  const deleteItem = (item) => {
    setItems((p) => p.filter((x) => x.id !== item.id));
    setOpenCardId(null);

    if (pendingDelete?.timeoutId) {
      clearTimeout(pendingDelete.timeoutId);
      performSupabaseDelete(pendingDelete.item);
    }

    const timeoutId = setTimeout(() => {
      performSupabaseDelete(item);
      setPendingDelete(null);
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 6000);

    setPendingDelete({ item, timeoutId });

    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const cancelDelete = () => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timeoutId);
    setItems((prev) => [pendingDelete.item, ...prev]);
    setPendingDelete(null);
    Animated.timing(toastOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    return () => {
      if (pendingDelete?.timeoutId) {
        clearTimeout(pendingDelete.timeoutId);
        performSupabaseDelete(pendingDelete.item);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!scrollToId || loading || items.length === 0) return;
    const index = items.findIndex((x) => x.id === scrollToId);
    if (index < 0) {
      navigation.setParams({ scrollToId: undefined });
      return;
    }
    const timer = setTimeout(() => {
      try {
        flatListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.3,
        });
      } catch (_) {
        // ignoré — onScrollToIndexFailed prendra le relais
      }
      navigation.setParams({ scrollToId: undefined });
    }, 200);
    return () => clearTimeout(timer);
  }, [scrollToId, loading, items, navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Mon Frigo</Text>
            <Text style={styles.headerCount}>
              {items.length} ingrédient{items.length > 1 ? 's' : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => setModalOpen(true)}
            style={({ pressed }) => [
              styles.fab,
              pressed && styles.fabPressed,
            ]}
            accessibilityLabel="Ajouter un ingrédient"
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
      ) : (
        <>
          <ExpirationAlertBanner items={items} />
          <FlatList
          ref={flatListRef}
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={(info) => {
            const offset = info.averageItemLength * info.index;
            flatListRef.current?.scrollToOffset({ offset, animated: true });
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0.3,
              });
            }, 300);
          }}
          renderItem={({ item, index }) => (
            <FadeInView
              delay={Math.min(index * 50, 500)}
              style={styles.cardWrap}
            >
              <SwipeableCard
                id={item.id}
                openCardId={openCardId}
                onOpenChange={setOpenCardId}
                onDelete={() => deleteItem(item)}
                confirmTitle={`Supprimer ${item.name} ?`}
                confirmMessage="Suppression définitive."
                borderRadius={14}
              >
                <FridgeRowContent
                  item={item}
                  onChangeQty={changeQty}
                  onEdit={openItemEditor}
                  styles={styles}
                  colors={colors}
                />
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
              <Text style={styles.emptyEmoji}>❄️</Text>
              <Text style={styles.emptyTitle}>Frigo vide</Text>
              <Text style={styles.emptyHint}>
                Appuyez sur + pour ajouter un ingrédient
              </Text>
            </View>
          }
        />
        </>
      )}

      <AddItemModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addItem}
        styles={styles}
        colors={colors}
      />

      <EditItemModal
        visible={!!editingItem}
        item={editingItem}
        onClose={closeItemEditor}
        onSave={saveItem}
        onDelete={deleteItem}
        colors={colors}
        styles={styles}
      />

      {pendingDelete && (
        <Animated.View
          style={[styles.toast, { opacity: toastOpacity }]}
          pointerEvents="box-none"
        >
          <View style={styles.toastInner}>
            <Text style={styles.toastText} numberOfLines={1}>
              {pendingDelete.item.name} supprimé
            </Text>
            <Pressable
              onPress={cancelDelete}
              style={styles.toastBtn}
              hitSlop={10}
            >
              <Text style={styles.toastBtnText}>Annuler</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerInner: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  headerCount: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fab: {
    width: 44,
    height: 44,
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
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 26,
    marginTop: -2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 24,
    lineHeight: 24,
    color: colors.text,
    marginTop: -2,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    alignItems: 'stretch',
    gap: 8,
  },

  cardWrap: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },

  // Card
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: spacing.sm,
    minHeight: 60,
  },
  cardEmoji: {
    fontSize: 22,
    marginRight: 4,
  },
  cardTextCol: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    marginRight: 4,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  expirationLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  editIcon: {
    fontSize: 16,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyBadge: {
    height: 36,
    width: 50,
    backgroundColor: colors.ingredientBg,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBadgeText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  qtyAddBtn: {
    height: 36,
    width: 36,
    backgroundColor: colors.ingredientBg,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  qtyAddText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    lineHeight: 20,
  },
  qtyInput: {
    width: 50,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  unitText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },

  // State
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },

  // Modal : positionnée en haut
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  modalBackdropTap: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    width: '100%',
    maxWidth: maxContentWidth,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 10,
    marginBottom: 6,
  },
  modalInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  unitChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitChipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  unitChipTextActive: { color: '#FFFFFF' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateClearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dateClearText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: -2,
  },
  dateNativeHint: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  modalActions: {
    marginTop: 10,
    gap: 8,
  },
  modalAddBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  modalCancelBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  // Edit item modal (bottom sheet)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  editModalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    maxHeight: '90%',
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  editModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 8,
    flexWrap: 'wrap',
  },
  editModalBtnDanger: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E74C3C',
  },
  editModalBtnDangerText: {
    color: '#E74C3C',
    fontSize: 13,
    fontWeight: '600',
  },
  editModalBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  editModalBtnSecondaryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  editModalBtnPrimary: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  editModalBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Toast "supprimé · Annuler"
  toast: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toastInner: {
    width: '100%',
    maxWidth: maxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  toastBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 12,
  },
  toastBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
