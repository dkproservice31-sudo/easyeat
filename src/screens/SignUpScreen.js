import React, { useState } from 'react';
import { Text, View, Alert } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { spacing, typography } from '../theme/theme';

export default function SignUpScreen({ navigation }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    const { error } = await signUp(email, password);
    setLoading(false);
    if (error) return Alert.alert('Erreur', error.message);
    Alert.alert('Bienvenue', 'Vérifiez votre email pour confirmer votre compte.');
  };

  return (
    <Screen>
      <Text style={typography.h1}>Créer un compte</Text>
      <Text style={[typography.small, { marginBottom: spacing.xl }]}>Rejoignez EasyEat</Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="vous@exemple.com"
      />
      <Input
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Au moins 6 caractères"
      />
      <Button title="S'inscrire" onPress={onSubmit} loading={loading} />
      <View style={{ height: spacing.md }} />
      <Button
        title="Retour"
        variant="ghost"
        onPress={() => navigation.goBack()}
      />
    </Screen>
  );
}
