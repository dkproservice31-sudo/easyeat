import React, { useMemo, useState } from 'react';
import { Text, View, Alert, Platform, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { spacing } from '../theme/theme';

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function SignInScreen({ navigation }) {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🍽️</Text>
          <Text style={styles.heroTitle}>EasyEat</Text>
          <Text style={styles.heroSubtitle}>Connectez-vous pour continuer</Text>
        </View>

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
      </View>
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
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
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
});
