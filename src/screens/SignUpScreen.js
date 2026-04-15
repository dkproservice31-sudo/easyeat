import React, { useState } from 'react';
import { Text, View, Alert, Platform, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { spacing, colors } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function SignUpScreen({ navigation }) {
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!username.trim()) e.username = "Nom d'utilisateur requis";
    else if (username.trim().length < 3) e.username = 'Au moins 3 caractères';
    if (!email.trim()) e.email = 'Email requis';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Email invalide';
    if (!password) e.password = 'Mot de passe requis';
    else if (password.length < 6) e.password = 'Au moins 6 caractères';
    if (confirm !== password) e.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    const { data, error } = await signUp(email, password, username);
    setLoading(false);
    if (error) return notify('Inscription impossible', error.message);

    // Si confirmation email activée: pas de session immédiate
    if (!data?.session) {
      notify(
        'Vérifiez votre email',
        'Un lien de confirmation vous a été envoyé. Confirmez votre compte puis connectez-vous.'
      );
      navigation.navigate('SignIn');
    }
    // Sinon, AuthContext bascule automatiquement vers l'app
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🍽️</Text>
          <Text style={styles.heroTitle}>EasyEat</Text>
          <Text style={styles.heroSubtitle}>Créez votre compte</Text>
        </View>
        <Input
          label="Nom d'utilisateur"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="chefmarie"
        error={errors.username}
        editable={!loading}
      />
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
        autoComplete="password-new"
        textContentType="newPassword"
        placeholder="Au moins 6 caractères"
        error={errors.password}
        editable={!loading}
      />
      <Input
        label="Confirmer le mot de passe"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="password-new"
        placeholder="••••••••"
        error={errors.confirm}
        editable={!loading}
        onSubmitEditing={onSubmit}
      />
      <Button title="S'inscrire" onPress={onSubmit} loading={loading} />
      <View style={{ height: spacing.md }} />
      <Button
        title="Retour"
        variant="ghost"
        onPress={() => navigation.goBack()}
        disabled={loading}
      />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  heroEmoji: {
    fontSize: 60,
    marginBottom: 12,
    ...(Platform.OS === 'web'
      ? {
          fontFamily:
            '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif',
        }
      : null),
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 6,
  },
});
