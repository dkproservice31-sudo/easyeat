import React, { useCallback, useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Screen from '../components/Screen';
import FadeInView from '../components/FadeInView';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { spacing } from '../theme/theme';

function StatCard({ emoji, value, label, styles }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ThemeToggle({ isDark, onToggle, styles, colors }) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.themeRow,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityLabel="Basculer le mode sombre"
    >
      <View style={styles.themeLabelWrap}>
        <Text style={styles.themeEmoji}>🌙</Text>
        <Text style={styles.themeLabel}>Mode sombre</Text>
      </View>
      <View
        style={[
          styles.toggleTrack,
          { backgroundColor: isDark ? colors.primary : colors.border },
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            { alignSelf: isDark ? 'flex-end' : 'flex-start' },
          ]}
        />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { user, profile, signOut, isAdmin, isEditor } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const [stats, setStats] = useState({ recipes: 0, fridge: 0, ai: 0 });

  const username =
    profile?.username || user?.email?.split('@')[0] || 'Utilisateur';
  const initial = (username || '?').charAt(0).toUpperCase();

  const loadStats = useCallback(async () => {
    if (!user) return;
    const [recipesRes, fridgeRes, aiRes] = await Promise.all([
      supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or('featured.is.null,featured.eq.false'),
      supabase
        .from('fridge_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('generated_by_ai', true)
        .or('featured.is.null,featured.eq.false'),
    ]);
    setStats({
      recipes: recipesRes.count ?? 0,
      fridge: fridgeRes.count ?? 0,
      ai: aiRes.count ?? 0,
    });
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  return (
    <Screen>
      <View style={styles.container}>
        <FadeInView delay={0}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Text style={styles.name}>{username}</Text>
            {user?.email ? (
              <Text style={styles.email}>{user.email}</Text>
            ) : null}
          </View>
        </FadeInView>

        <FadeInView delay={120}>
          <View style={styles.statsRow}>
            <StatCard emoji="📖" value={stats.recipes} label="Recettes" styles={styles} />
            <StatCard emoji="❄️" value={stats.fridge} label="Frigo" styles={styles} />
            <StatCard emoji="✨" value={stats.ai} label="IA" styles={styles} />
          </View>
        </FadeInView>

        <FadeInView delay={180}>
          <ThemeToggle
            isDark={isDark}
            onToggle={toggleTheme}
            styles={styles}
            colors={colors}
          />
        </FadeInView>

        {isEditor && (
          <FadeInView delay={240}>
            <Pressable
              onPress={() => navigation.navigate('Admin')}
              style={({ pressed }) => [
                styles.adminBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel={isAdmin ? 'Panneau Admin' : 'Panneau Éditeur'}
            >
              <Text style={styles.adminBtnText}>
                🔧 {isAdmin ? 'Panneau Admin' : 'Panneau Éditeur'}
              </Text>
            </Pressable>
          </FadeInView>
        )}

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Se déconnecter"
        >
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
    },
    header: { alignItems: 'center' },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.surface, fontSize: 32, fontWeight: '700' },
    name: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginTop: 12,
      textAlign: 'center',
    },
    email: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: 24,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 14,
      alignItems: 'center',
    },
    statEmoji: { fontSize: 22 },
    statValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginTop: 4,
    },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

    themeRow: {
      marginTop: 16,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    themeLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    themeEmoji: { fontSize: 18 },
    themeLabel: { fontSize: 15, color: colors.text, fontWeight: '600' },
    toggleTrack: {
      width: 44,
      height: 24,
      borderRadius: 12,
      padding: 2,
      justifyContent: 'center',
    },
    toggleThumb: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },

    adminBtn: {
      marginTop: 16,
      minHeight: 50,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    adminBtnText: { color: colors.surface, fontSize: 15, fontWeight: '700' },

    signOutBtn: {
      minHeight: 50,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  });
