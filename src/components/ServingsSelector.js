import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { colors, spacing, touch } from '../theme/theme';

const PRESETS = ['1', '2', '3', '4', '5', '6', '8', '10', '12'];

// value: string (1-50 comme string). onChange(string).
export default function ServingsSelector({ value, onChange, disabled }) {
  const isPreset = PRESETS.includes(value);
  const [custom, setCustom] = useState(isPreset ? '' : value || '');

  const onChangeCustom = (txt) => {
    const digits = txt.replace(/\D/g, '').slice(0, 2);
    setCustom(digits);
    const n = parseInt(digits, 10);
    if (digits && n >= 1 && n <= 50) {
      onChange(String(n));
    } else if (!digits) {
      if (!isPreset) onChange('');
    }
  };

  const onPickPreset = (v) => {
    setCustom('');
    onChange(v);
  };

  const hasCustom = custom.length > 0;
  const customInvalid =
    hasCustom && (parseInt(custom, 10) < 1 || parseInt(custom, 10) > 50);
  const selected = hasCustom ? '' : value;

  return (
    <View>
      <View style={styles.grid}>
        {PRESETS.map((v) => {
          const active = selected === v;
          return (
            <Pressable
              key={v}
              onPress={() => !disabled && onPickPreset(v)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.circle,
                active && styles.circleActive,
                pressed && !disabled && { opacity: 0.85 },
                disabled && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.circleText, active && styles.circleTextActive]}>
                {v}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Autre...</Text>
        <TextInput
          value={custom}
          onChangeText={onChangeCustom}
          placeholder="ex : 15"
          placeholderTextColor="#A9A49C"
          keyboardType="number-pad"
          maxLength={2}
          editable={!disabled}
          style={[styles.input, customInvalid && styles.inputInvalid]}
        />
      </View>
      {customInvalid && <Text style={styles.error}>Entre 1 et 50.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  circleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  circleTextActive: { color: '#FFFFFF' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  input: {
    flex: 1,
    maxWidth: 140,
    minHeight: touch.minHeight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: '#1A1A1A',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  inputInvalid: { borderColor: colors.error },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.xs },
});
