import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, StyleSheet } from 'react-native';

import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { registerServiceWorker } from './src/lib/pushNotifications';

// Web : styles globaux qui réagissent au thème
function useWebGlobalStyles() {
  const { colors, isDark } = useTheme();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // viewport-fit=cover pour que env(safe-area-inset-*) fonctionne sur iOS
    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement('meta');
      vp.name = 'viewport';
      document.head.appendChild(vp);
    }
    vp.content =
      'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1';

    // PWA : manifest + balises meta iOS
    const head = document.head;
    const ensureTag = (selector, create) => {
      if (!document.querySelector(selector)) head.appendChild(create());
    };
    ensureTag('link[rel="manifest"]', () => {
      const l = document.createElement('link');
      l.rel = 'manifest';
      l.href = '/manifest.json';
      return l;
    });
    ensureTag('meta[name="apple-mobile-web-app-capable"]', () => {
      const m = document.createElement('meta');
      m.name = 'apple-mobile-web-app-capable';
      m.content = 'yes';
      return m;
    });
    ensureTag('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
      const m = document.createElement('meta');
      m.name = 'apple-mobile-web-app-status-bar-style';
      m.content = 'default';
      return m;
    });
    ensureTag('link[rel="apple-touch-icon"]', () => {
      const l = document.createElement('link');
      l.rel = 'apple-touch-icon';
      l.href = '/icon-192.png';
      return l;
    });

    // theme-color dynamique
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = colors.primary;

    // Styles globaux (recréés à chaque changement de thème)
    const EMOJI_FONTS =
      '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji"';
    const existing = document.querySelector('style[data-easyeat="global"]');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.setAttribute('data-easyeat', 'global');
    style.textContent = `
      html, body, #root {
        height: 100%;
        margin: 0;
        background: ${colors.background};
        overflow: hidden;
        overscroll-behavior: none;
      }
      body, input, textarea, button, select, [class] {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif, ${EMOJI_FONTS};
      }
      *::-webkit-scrollbar { display: none; width: 0; height: 0; background: transparent; }
      * { scrollbar-width: none; -ms-overflow-style: none; }
      input, textarea { font-size: 16px; color: ${colors.text}; }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [colors.background, colors.text, colors.primary, isDark]);
}

function AppInner() {
  useWebGlobalStyles();
  const { isDark } = useTheme();

  useEffect(() => {
    // Enregistrement silencieux du Service Worker au démarrage (PWA + push).
    // Aucune permission notification demandée ici : c'est fait depuis le
    // toggle dans ProfileScreen quand l'utilisateur l'active.
    registerServiceWorker();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
