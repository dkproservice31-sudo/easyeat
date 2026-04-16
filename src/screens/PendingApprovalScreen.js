import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

export default function PendingApprovalScreen() {
  const { profile, signOut, reloadProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [editorName, setEditorName] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = profile?.requested_editor_id;
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, first_name')
        .eq('id', id)
        .maybeSingle();
      if (data) setEditorName(data.username || data.first_name || null);
    })();
  }, [profile?.requested_editor_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reloadProfile?.();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text style={styles.emoji}>⏳</Text>
        <Text style={styles.title}>Inscription en attente</Text>
        <Text style={styles.text}>
          Votre demande a été envoyée
          {editorName ? ` à ${editorName}` : ''}. Vous recevrez l'accès dès que
          votre compte sera validé.
        </Text>
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !refreshing && { opacity: 0.85 },
            refreshing && { opacity: 0.6 },
          ]}
        >
          {refreshing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Actualiser</Text>
          )}
        </Pressable>
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.ghostBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.ghostBtnText}>Se déconnecter</Text>
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
      color: colors.text,
      textAlign: 'center',
    },
    text: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    primaryBtn: {
      minWidth: 200,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    ghostBtn: { paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    ghostBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  });
