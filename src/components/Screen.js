import React from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, maxContentWidth, spacing } from '../theme/theme';

export default function Screen({ children, scroll = true, style }) {
  const Inner = (
    <View style={[styles.inner, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {Inner}
          </ScrollView>
        ) : (
          Inner
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center' },
  scroll: { flex: 1, width: '100%', maxWidth: maxContentWidth },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
  inner: { flex: 1, width: '100%', maxWidth: maxContentWidth, paddingHorizontal: Platform.OS === 'web' ? spacing.md : 0 },
});
