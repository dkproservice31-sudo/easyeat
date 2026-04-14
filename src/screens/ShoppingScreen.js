import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  FlatList,
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

function ShoppingRow({ item, checked, onToggle }) {
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
      <Text style={[styles.qty, checked && styles.nameChecked]}>
        {item.quantity > 0 ? `${item.quantity} ${item.unit}` : item.unit}
      </Text>
    </Pressable>
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
        <Pressable style={styles.modalBackdropTap} onPress={busy ? undefined : onClose} />
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
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('fridge_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('quantity', 0)
      .order('created_at', { ascending: false });
    if (!error) setItems(data ?? []);
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('shopping_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) setHistory(data ?? []);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await Promise.all([loadItems(), loadHistory()]);
        setLoading(false);
      })();
    }, [loadItems, loadHistory])
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
        () => loadItems()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadItems]);

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
    await Promise.all([loadItems(), loadHistory()]);
    setRefreshing(false);
  };

  // Ramène quantity=1 pour tous les items cochés
  const completePurchase = async (saveToHistory) => {
    const checkedItems = items.filter((i) => checked.has(i.id));
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
    await Promise.all([loadItems(), loadHistory()]);
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
        <Text
          style={[typography.small, { marginTop: spacing.xs, textAlign: 'center' }]}
        >
          {items.length} à acheter · {checked.size} dans le caddie
        </Text>
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
            <ShoppingRow
              item={item}
              checked={checked.has(item.id)}
              onToggle={toggle}
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
              <Text style={typography.h3}>Aucune course à faire</Text>
              <Text
                style={[
                  typography.small,
                  { marginTop: spacing.sm, textAlign: 'center' },
                ]}
              >
                Les ingrédients à quantité 0 apparaîtront ici.
              </Text>
            </View>
          }
          ListFooterComponent={
            history.length > 0 ? (
              <View style={styles.historyWrap}>
                <Text style={styles.historyTitle}>Historique des courses</Text>
                {history.map((h) => (
                  <HistoryCard
                    key={h.id}
                    entry={h}
                    onDelete={deleteHistory}
                  />
                ))}
              </View>
            ) : null
          }
        />
      )}

      {items.length > 0 && (
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
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 120,
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
  qty: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
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
  modalBtnCancel: {
    backgroundColor: '#E0E0E0',
  },
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
  historyDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDECEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDeleteText: {
    fontSize: 16,
    color: colors.error,
  },
  historyDate: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  historyCount: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  historyItems: {
    marginTop: spacing.sm,
  },
  historyItem: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
