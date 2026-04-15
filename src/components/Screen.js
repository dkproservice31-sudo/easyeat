import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebScroll from './WebScroll';
import { maxContentWidth, spacing } from '../theme/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function Screen({ children, scroll = true, style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const Inner = <View style={[styles.inner, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {scroll ? (
          <WebScroll
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {Inner}
          </WebScroll>
        ) : (
          Inner
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center' },
    scroll: { flex: 1, width: '100%', maxWidth: maxContentWidth },
    scrollContent: { flexGrow: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
    inner: { flex: 1, width: '100%', maxWidth: maxContentWidth, paddingHorizontal: Platform.OS === 'web' ? spacing.md : 0 },
  });
