import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  getExpirationStatus,
  getExpirationColor,
  getExpirationLabel,
  EXPIRATION_STATUS,
} from '../lib/expirationStatus';

export default function ExpirationBadge({ item, compact = true }) {
  const status = getExpirationStatus(item);

  if (status === EXPIRATION_STATUS.NONE) return null;

  const color = getExpirationColor(status);
  if (!color) return null;

  if (compact) {
    return <View style={[styles.dot, { backgroundColor: color }]} />;
  }

  const label = getExpirationLabel(item);

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {label ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
