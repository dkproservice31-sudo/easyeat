import React, { useMemo } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function BannedScreen() {
  const { signOut } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text style={styles.emoji}>🚫</Text>
        <Text style={styles.title}>Compte suspendu</Text>
        <Text style={styles.text}>
          Votre compte a été suspendu et ne peut plus accéder à l'application.
        </Text>
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.btn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.btnText}>Se déconnecter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    emoji: { fontSize: 72, marginBottom: 8 },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.danger,
      textAlign: 'center',
    },
    text: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    btn: {
      minWidth: 200,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  });
