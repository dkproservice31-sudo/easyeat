import React from 'react';
import { Text, View } from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { spacing, typography } from '../theme/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <Text style={typography.h1}>Profil</Text>
      <View style={{ marginTop: spacing.md }}>
        <Text style={typography.body}>{user?.email ?? 'Non connecté'}</Text>
      </View>
      <View style={{ marginTop: spacing.xl }}>
        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
