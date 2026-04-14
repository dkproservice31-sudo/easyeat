import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import ChipGroup from './ChipGroup';
import { colors, radius, spacing, touch } from '../theme/theme';

const PRESETS = ['1', '2', '3', '4', '5', '6', '8', '10', '12'];

// value: string (1-50 comme string). onChange(string).
export default function ServingsSelector({ value, onChange, disabled }) {
  const isPreset = PRESETS.includes(value);
  const [custom, setCustom] = useState(isPreset ? '' : value || '');

  const onChangeCustom = (txt) => {
    // garde uniquement les chiffres
    const digits = txt.replace(/\D/g, '').slice(0, 2);
    setCustom(digits);
    const n = parseInt(digits, 10);
    if (digits && n >= 1 && n <= 50) {
      onChange(String(n));
    } else if (!digits) {
      // si on vide, on retombe sur le chip sélectionné précédemment (ou vide)
      if (!isPreset) onChange('');
    }
  };

  const onChipChange = (v) => {
    if (v) {
      setCustom('');
      onChange(v);
    } else {
      onChange('');
    }
  };

  const hasCustom = custom.length > 0;
  const customInvalid =
    hasCustom && (parseInt(custom, 10) < 1 || parseInt(custom, 10) > 50);

  return (
    <View>
      <ChipGroup
        options={PRESETS}
        value={hasCustom ? '' : value}
        onChange={onChipChange}
        disabled={disabled}
      />
      <View style={styles.row}>
        <Text style={styles.label}>Autre...</Text>
        <TextInput
          value={custom}
          onChangeText={onChangeCustom}
          placeholder="ex : 15"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={2}
          editable={!disabled}
          style={[styles.input, customInvalid && styles.inputInvalid]}
        />
      </View>
      {customInvalid && (
        <Text style={styles.error}>Entre 1 et 50.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    flex: 1,
    maxWidth: 120,
    minHeight: touch.minHeight,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  inputInvalid: { borderColor: colors.error },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.xs },
});
