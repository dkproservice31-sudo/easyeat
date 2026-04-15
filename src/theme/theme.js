import { Platform } from 'react-native';

export const lightColors = {
  background: '#FFF8F0',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF0E8',
  text: '#333333',
  textSecondary: '#888888',
  textTertiary: '#999999',
  textHint: '#BBBBBB',
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  primaryLight: '#FFF0E8',
  secondary: '#2EC4B6',
  border: '#F0E8E0',
  borderInput: '#F0E8E0',
  danger: '#E74C3C',
  dangerLight: '#FFEBEE',
  dangerText: '#C62828',
  error: '#E74C3C',
  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#F57F17',
  warningLight: '#FFF8E1',
  ingredientBg: '#FFF0E8',
  ingredientBorder: '#FF6B35',
  tabBarBg: '#FFFFFF',
  cardShadow: 'rgba(0,0,0,0.04)',
  // Aliases legacy
  textMuted: '#888888',
};

export const darkColors = {
  background: '#1A1A1A',
  surface: '#2A2A2A',
  surfaceAlt: '#3A2A20',
  text: '#F0F0F0',
  textSecondary: '#AAAAAA',
  textTertiary: '#888888',
  textHint: '#666666',
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  primaryLight: '#3A2A20',
  secondary: '#2EC4B6',
  border: '#3A3A3A',
  borderInput: '#4A4A4A',
  danger: '#E74C3C',
  dangerLight: '#3A2020',
  dangerText: '#FF6B6B',
  error: '#E74C3C',
  success: '#4CAF50',
  successLight: '#1A3A1A',
  warning: '#FFB74D',
  warningLight: '#3A3020',
  ingredientBg: '#3A2A20',
  ingredientBorder: '#FF6B35',
  tabBarBg: '#1A1A1A',
  cardShadow: 'rgba(0,0,0,0.2)',
  textMuted: '#AAAAAA',
};

// Export legacy `colors` = palette claire, pour tout code qui n'utilise pas
// encore `useTheme()`. Les écrans migrés doivent préférer `useTheme()`.
export const colors = lightColors;

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

export function makeTypography(c) {
  return {
    h1: { fontSize: 28, fontWeight: '700', color: c.text },
    h2: { fontSize: 22, fontWeight: '700', color: c.text },
    h3: { fontSize: 18, fontWeight: '600', color: c.text },
    body: { fontSize: 16, color: c.text },
    small: { fontSize: 14, color: c.textSecondary },
  };
}

export const typography = makeTypography(lightColors);

export const touch = {
  minHeight: 48,
  minWidth: 48,
};

export const maxContentWidth = 480;

export const isWeb = Platform.OS === 'web';
