import React from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, touch } from '../theme/theme';

export default function Input({ label, error, style, ...props }) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error && styles.inputError, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md, width: '100%' },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: touch.minHeight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  inputError: { borderColor: colors.error },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.xs },
});
