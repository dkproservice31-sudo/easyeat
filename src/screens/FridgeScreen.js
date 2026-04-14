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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import ChipGroup from '../components/ChipGroup';
import Button from '../components/Button';
import {
  colors,
  radius,
  spacing,
  typography,
  maxContentWidth,
  touch,
} from '../theme/theme';

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

function FridgeRow({ item, onChangeQty, onDelete }) {
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
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.rowQtyWrap}>
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
              style={styles.qtyTap}
            >
              <Text style={styles.qtyText}>{item.quantity}</Text>
            </Pressable>
          )}
          <Text style={styles.unitText}>{item.unit}</Text>
        </View>
      </View>
      <Pressable
        onPress={() => onDelete(item)}
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel={`Supprimer ${item.name}`}
        hitSlop={8}
      >
        <Text style={styles.deleteText}>×</Text>
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
          <Text style={typography.h2}>Nouvel ingrédient</Text>

          <Text style={styles.fieldLabel}>Nom</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Tomates, œufs, lait..."
            placeholderTextColor={colors.textMuted}
            style={styles.modalInput}
            autoFocus
            maxLength={60}
          />

          <Text style={styles.fieldLabel}>Quantité</Text>
          <TextInput
            value={qty}
            onChangeText={setQty}
            placeholder="1"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={styles.modalInput}
            maxLength={8}
          />

          <Text style={styles.fieldLabel}>Unité</Text>
          <ChipGroup
            options={UNITS}
            value={unit}
            onChange={(v) => setUnit(v || 'unité')}
          />

          <View style={{ marginTop: spacing.md }}>
            <Button
              title="Ajouter"
              onPress={submit}
              loading={saving}
              disabled={!name.trim()}
            />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Annuler"
              variant="ghost"
              onPress={onClose}
              disabled={saving}
            />
          </View>
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
    // Optimistic
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

  const deleteItem = async (item) => {
    const ok = await confirmDialog(
      `Supprimer ${item.name} ?`,
      'Suppression définitive.'
    );
    if (!ok) return;
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== item.id));
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
          <Text style={typography.h1}>Mon Frigo</Text>
          <Pressable
            onPress={() => setModalOpen(true)}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
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
          renderItem={({ item }) => (
            <FridgeRow
              item={item}
              onChangeQty={changeQty}
              onDelete={deleteItem}
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
              <Text style={typography.h3}>Frigo vide</Text>
              <Text
                style={[
                  typography.small,
                  { marginTop: spacing.sm, textAlign: 'center' },
                ]}
              >
                Appuyez sur + pour ajouter un ingrédient.
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
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  rowQtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qtyTap: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FFF1E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  qtyInput: {
    minWidth: 64,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  unitText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: -2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    maxWidth: maxContentWidth,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  modalInput: {
    minHeight: touch.minHeight,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
});
