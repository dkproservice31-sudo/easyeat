import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import SwipeableCard from '../components/SwipeableCard';
import FadeInView from '../components/FadeInView';
import { colors, radius, spacing, maxContentWidth } from '../theme/theme';

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

function FridgeRowContent({ item, onChangeQty, onQuickDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(item.quantity));

  const save = () => {
    setEditing(false);
    const n = Number(draft.replace(',', '.'));
    if (isNaN(n) || n < 0) {
      setDraft(String(item.quantity));
      return;
    }
    if (n !== Number(item.quantity)) onChangeQty(item, n);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardName} numberOfLines={1}>
        {item.name}
      </Text>

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
          />
        ) : (
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
        )}
        <Text style={styles.unitText}>{item.unit}</Text>
      </View>

      <Pressable
        onPress={() => onQuickDelete(item)}
        style={styles.trashHit}
        accessibilityLabel={`Supprimer ${item.name}`}
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
    </View>
  );
}

function AddItemModal({ visible, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('unité');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setQty('1');
    setUnit('unité');
  };

  const submit = async () => {
    if (!name.trim()) return;
    const n = Number(qty.replace(',', '.'));
    if (isNaN(n) || n < 0) return;
    setSaving(true);
    const ok = await onAdd({ name: name.trim(), quantity: n, unit });
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
              placeholderTextColor="#A9A49C"
              style={styles.modalInput}
              autoFocus
              maxLength={60}
            />

            <Text style={styles.fieldLabel}>Quantité</Text>
            <TextInput
              value={qty}
              onChangeText={setQty}
              placeholder="1"
              placeholderTextColor="#A9A49C"
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

export default function FridgeScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [openCardId, setOpenCardId] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('fridge_items')
      .select('*')
      .eq('user_id', user.id)
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

  const addItem = async ({ name, quantity, unit }) => {
    if (!user) return false;
    const { data, error } = await supabase
      .from('fridge_items')
      .insert({ user_id: user.id, name, quantity, unit })
      .select('*')
      .single();
    if (error) {
      notify('Ajout impossible', error.message);
      return false;
    }
    setItems((prev) => [data, ...prev]);
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

  const quickDeleteItem = async (item) => {
    const ok = await confirmDialog(
      `Supprimer ${item.name} ?`,
      'Suppression définitive.'
    );
    if (ok) deleteItem(item);
  };

  const deleteItem = async (item) => {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== item.id));
    setOpenCardId(null);
    const { error } = await supabase
      .from('fridge_items')
      .delete()
      .eq('id', item.id);
    if (error) {
      notify('Suppression impossible', error.message);
      setItems(prev);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
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
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
                  onQuickDelete={quickDeleteItem}
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
      )}

      <AddItemModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    color: '#1A1A1A',
  },
  headerCount: {
    fontSize: 13,
    color: '#888',
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
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 26,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    paddingLeft: 16,
    paddingRight: 38,
    paddingVertical: 14,
    gap: spacing.sm,
    minHeight: 60,
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyBadge: {
    height: 36,
    width: 50,
    backgroundColor: '#FFF0E8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBadgeText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  qtyInput: {
    width: 50,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  unitText: { fontSize: 13, color: '#888', fontWeight: '600' },
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
    color: '#1A1A1A',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: '#888',
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
    backgroundColor: '#FFFFFF',
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
    color: '#1A1A1A',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 10,
    marginBottom: 6,
  },
  modalInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#1A1A1A',
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
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitChipText: { fontSize: 13, fontWeight: '700', color: '#666' },
  unitChipTextActive: { color: '#fff' },
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
  modalAddText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalCancelBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
