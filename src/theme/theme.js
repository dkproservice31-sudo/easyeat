import { Platform } from 'react-native';

export const colors = {
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  secondary: '#2EC4B6',
  background: '#FFF8F0',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  border: '#ECECEC',
  error: '#E63946',
  success: '#06A77D',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', color: colors.text },
  h2: { fontSize: 22, fontWeight: '700', color: colors.text },
  h3: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  small: { fontSize: 14, color: colors.textMuted },
};

// Mobile-first sizing: min 44x44 tap target (iOS HIG)
export const touch = {
  minHeight: 48,
  minWidth: 48,
};

export const maxContentWidth = 480;

export const isWeb = Platform.OS === 'web';
