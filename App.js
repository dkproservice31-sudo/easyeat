import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, StyleSheet } from 'react-native';

import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

// Web : cache toutes les scrollbars + viewport-fit=cover pour les safe areas
function useWebGlobalStyles() {
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

    // Cache les scrollbars visuelles SANS casser le scroll (molette, clavier,
    // touch). On ne touche pas à overflow — seulement à l'apparence de la barre.
    // On ajoute aussi la fallback des polices emoji pour que les 🥩🍗🍝 etc.
    // s'affichent correctement sur Windows/Linux/Chrome.
    const EMOJI_FONTS =
      '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji"';
    const style = document.createElement('style');
    style.setAttribute('data-easyeat', 'global');
    style.textContent = `
      html, body, #root {
        height: 100%;
        margin: 0;
        background: #FFF8F0;
        /* Empêche le scroll du body et force la molette à aller dans les
           ScrollView internes de l'app */
        overflow: hidden;
        overscroll-behavior: none;
      }
      body, input, textarea, button, select, [class] {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif, ${EMOJI_FONTS};
      }
      /* Cache les scrollbars sans désactiver le scroll */
      *::-webkit-scrollbar { display: none; width: 0; height: 0; background: transparent; }
      * { scrollbar-width: none; -ms-overflow-style: none; }
      input, textarea { font-size: 16px; }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);
}

export default function App() {
  useWebGlobalStyles();
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
