import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { colors, radius, spacing, typography } from '../theme/theme';

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  return (
    <Screen>
      <Text style={typography.h1}>Profil</Text>
      <View style={styles.card}>
        <Text style={typography.h3}>
          {profile?.username ?? 'Chargement...'}
        </Text>
        <Text style={[typography.small, { marginTop: spacing.xs }]}>
          {user?.email}
        </Text>
      </View>
      <View style={{ marginTop: spacing.xl }}>
        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
