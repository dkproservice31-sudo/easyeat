import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

function detectStandalone() {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;

  // iOS Safari
  if (window.navigator && window.navigator.standalone === true) return true;

  // Chrome/Edge/Firefox desktop + Android Chrome
  if (
    window.matchMedia &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }

  return false;
}

function detectPlatform() {
  if (Platform.OS !== 'web') return 'other';
  if (typeof navigator === 'undefined') return 'other';

  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const INSTRUCTIONS = {
  ios: [
    "1. Tape sur l'icône Partager ⬆️ en bas de Safari",
    "2. Fais défiler et tape sur « Sur l'écran d'accueil »",
    '3. Confirme en tapant « Ajouter »',
  ],
  android: [
    '1. Tape sur le menu ⋮ en haut à droite de Chrome',
    "2. Tape sur « Installer l'application » ou « Ajouter à l'écran d'accueil »",
    "3. Confirme l'installation",
  ],
  desktop: [
    "1. Cherche l'icône d'installation dans la barre d'adresse",
    '2. Ou va dans le menu ⋮ → « Installer EasyEat »',
  ],
  other: [
    'Ouvre EasyEat dans Safari (iOS) ou Chrome (Android) pour installer l\'app',
  ],
};

export default function PWAInstallHint() {
  const { colors } = useTheme();
  // Par défaut : caché pour éviter un flash avant la détection
  const [standalone, setStandalone] = useState(true);
  const [platform, setPlatform] = useState('other');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setStandalone(detectStandalone());
    setPlatform(detectPlatform());
  }, []);

  if (standalone) return null;
  if (Platform.OS !== 'web') return null;

  const steps = INSTRUCTIONS[platform] || INSTRUCTIONS.other;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Pressable
        onPress={() => setShowDetails((v) => !v)}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel={
          showDetails ? 'Masquer les instructions' : 'Voir les instructions'
        }
      >
        <Text style={styles.icon}>📱</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            Ajoute EasyEat à ton écran d'accueil
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Accès rapide + notifications de péremption
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>
          {showDetails ? '▲' : '▼'}
        </Text>
      </Pressable>

      {showDetails ? (
        <View style={styles.details}>
          {steps.map((step, i) => (
            <Text key={i} style={[styles.step, { color: colors.text }]}>
              {step}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  icon: {
    fontSize: 22,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  chevron: {
    fontSize: 12,
    fontWeight: '600',
  },
  details: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 6,
  },
  step: {
    fontSize: 12,
    lineHeight: 18,
  },
});
