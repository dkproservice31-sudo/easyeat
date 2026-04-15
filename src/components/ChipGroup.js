import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { radius, spacing, touch } from '../theme/theme';
import { useTheme } from '../contexts/ThemeContext';

function Chip({ label, selected, onPress, onDelete, disabled, styles }) {
  return (
    <View style={styles.chipWrap}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.chip,
          selected && styles.chipSelected,
          onDelete && styles.chipWithDelete,
          pressed && !disabled && styles.chipPressed,
          disabled && styles.chipDisabled,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Text style={[styles.text, selected && styles.textSelected]}>
          {label}
        </Text>
      </Pressable>
      {onDelete && (
        <Pressable
          onPress={onDelete}
          disabled={disabled}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && styles.chipPressed,
            disabled && styles.chipDisabled,
          ]}
          accessibilityLabel={`Supprimer ${label}`}
          hitSlop={8}
        >
          <Text style={styles.deleteText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ChipGroup({
  options = [],
  customs = [],
  value,
  onChange,
  onAddCustom,
  onDeleteCustom,
  disabled,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await onAddCustom?.(v);
      setDraft('');
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft('');
    setAdding(false);
  };

  return (
    <View>
      <View style={styles.wrap}>
        {options.map((opt) => (
          <Chip
            key={`opt-${opt}`}
            label={opt}
            selected={value === opt}
            onPress={() => onChange(value === opt ? '' : opt)}
            disabled={disabled}
            styles={styles}
          />
        ))}
        {customs.map((c) => (
          <Chip
            key={`custom-${c.id}`}
            label={c.value}
            selected={value === c.value}
            onPress={() => onChange(value === c.value ? '' : c.value)}
            onDelete={() => onDeleteCustom?.(c)}
            disabled={disabled}
            styles={styles}
          />
        ))}
        <Pressable
          onPress={() => setAdding(true)}
          disabled={disabled || adding}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && !disabled && styles.chipPressed,
            (disabled || adding) && styles.chipDisabled,
          ]}
          accessibilityLabel="Ajouter une option personnalisée"
          hitSlop={6}
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      {adding && (
        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Votre option..."
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoFocus
            maxLength={40}
            onSubmitEditing={confirm}
            returnKeyType="done"
            editable={!busy}
          />
          <Pressable
            onPress={confirm}
            disabled={!draft.trim() || busy}
            style={({ pressed }) => [
              styles.confirmBtn,
              (!draft.trim() || busy) && styles.chipDisabled,
              pressed && draft.trim() && !busy && styles.chipPressed,
            ]}
          >
            <Text style={styles.confirmText}>
              {busy ? '...' : 'Ajouter'}
            </Text>
          </Pressable>
          <Pressable
            onPress={cancel}
            disabled={busy}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.chipPressed,
            ]}
            accessibilityLabel="Annuler"
          >
            <Text style={styles.cancelText}>✕</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  chipWrap: { position: 'relative' },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWithDelete: { paddingRight: spacing.lg + 4 },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  chipDisabled: { opacity: 0.5 },
  text: { fontSize: 14, fontWeight: '600', color: colors.text },
  textSelected: { color: colors.surface },
  deleteBtn: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  deleteText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: -1,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnText: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 26,
    marginTop: -2,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: touch.minHeight,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  confirmBtn: {
    minHeight: touch.minHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: colors.surface, fontWeight: '600', fontSize: 15 },
  cancelBtn: {
    width: touch.minHeight,
    height: touch.minHeight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelText: { color: colors.textSecondary, fontSize: 18 },
});
