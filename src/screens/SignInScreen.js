import React, { useState } from 'react';
import { Text, View, Alert } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { spacing, typography } from '../theme/theme';

export default function SignInScreen({ navigation }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) Alert.alert('Erreur', error.message);
  };

  return (
    <Screen>
      <Text style={typography.h1}>EasyEat</Text>
      <Text style={[typography.small, { marginBottom: spacing.xl }]}>Connectez-vous pour continuer</Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="vous@exemple.com"
      />
      <Input
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
      />
      <Button title="Se connecter" onPress={onSubmit} loading={loading} />
      <View style={{ height: spacing.md }} />
      <Button
        title="Créer un compte"
        variant="ghost"
        onPress={() => navigation.navigate('SignUp')}
      />
    </Screen>
  );
}
