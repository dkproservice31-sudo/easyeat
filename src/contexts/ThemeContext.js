import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, makeTypography } from '../theme/theme';

const STORAGE_KEY = 'easyeat.theme';
// Valeur : 'light' | 'dark' | 'system'

const ThemeContext = createContext({
  colors: lightColors,
  typography: makeTypography(lightColors),
  isDark: false,
  toggleTheme: () => {},
  setThemeMode: () => {},
  mode: 'system',
});

export function ThemeProvider({ children }) {
  const systemScheme = Appearance.getColorScheme();
  const [mode, setMode] = useState('system'); // 'light'|'dark'|'system'
  const [systemIsDark, setSystemIsDark] = useState(systemScheme === 'dark');

  // Charge la préférence persistée au démarrage
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setMode(stored);
        }
      } catch {}
    })();
  }, []);

  // Suit le thème système si mode='system'
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemIsDark(colorScheme === 'dark');
    });
    return () => sub.remove();
  }, []);

  const isDark = mode === 'system' ? systemIsDark : mode === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const typography = useMemo(() => makeTypography(colors), [colors]);

  const persist = async (value) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, value);
    } catch {}
  };

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setMode(next);
    persist(next);
  };

  const setThemeMode = (value) => {
    setMode(value);
    persist(value);
  };

  const value = useMemo(
    () => ({ colors, typography, isDark, toggleTheme, setThemeMode, mode }),
    [colors, typography, isDark, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
