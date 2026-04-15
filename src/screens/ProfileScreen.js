import React, { useCallback, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Screen from '../components/Screen';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/theme';

function StatCard({ emoji, value, label }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
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
        {/* Header avatar */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name}>{username}</Text>
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard emoji="📖" value={stats.recipes} label="Recettes" />
          <StatCard emoji="❄️" value={stats.fridge} label="Frigo" />
          <StatCard emoji="✨" value={stats.ai} label="IA" />
        </View>

        <View style={{ flex: 1 }} />

        {/* Logout */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },

  // Header
  header: {
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 12,
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    padding: 14,
    alignItems: 'center',
  },
  statEmoji: { fontSize: 22 },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 4,
  },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },

  // Sign out
  signOutBtn: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0E8E0',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  signOutText: {
    color: '#e74c3c',
    fontSize: 15,
    fontWeight: '700',
  },
});
