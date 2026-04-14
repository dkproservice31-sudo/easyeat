import React, { useState } from 'react';
import { Text, View, Alert, Platform } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { spacing, typography, colors } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function SignInScreen({ navigation }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!email.trim()) e.email = 'Email requis';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Email invalide';
    if (!password) e.password = 'Mot de passe requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) notify('Connexion impossible', error.message);
  };

  return (
    <Screen>
      <Text style={[typography.h1, { color: colors.primary }]}>EasyEat</Text>
      <Text style={[typography.small, { marginBottom: spacing.xl }]}>
        Connectez-vous pour continuer
      </Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="vous@exemple.com"
        error={errors.email}
        editable={!loading}
      />
      <Input
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        placeholder="••••••••"
        error={errors.password}
        editable={!loading}
        onSubmitEditing={onSubmit}
      />
      <Button title="Se connecter" onPress={onSubmit} loading={loading} />
      <View style={{ height: spacing.md }} />
      <Button
        title="Créer un compte"
        variant="ghost"
        onPress={() => navigation.navigate('SignUp')}
        disabled={loading}
      />
    </Screen>
  );
}
