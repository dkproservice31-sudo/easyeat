import React from 'react';
import { Platform, ScrollView, View } from 'react-native';

// Sur web, rend un <div> natif pour que la molette de souris fonctionne
// correctement (le ScrollView de RN Web ne gère pas toujours wheel).
// Sur natif, utilise un ScrollView classique.
export default function WebScroll({
  children,
  style,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  ...rest
}) {
  if (Platform.OS === 'web') {
    const cc = expandRNShortcuts(flattenStyle(contentContainerStyle));
    // Si maxWidth+alignSelf sont utilisés, on les transforme en margin auto
    // pour le centrage horizontal d'un enfant non-flex.
    const { alignSelf, ...innerRest } = cc;
    const centered = alignSelf === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : {};
    return React.createElement(
      'div',
      {
        style: {
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          width: '100%',
          height: '100%',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            boxSizing: 'border-box',
            width: '100%',
            ...innerRest,
            ...centered,
          },
        },
        children
      )
    );
  }
  return (
    <ScrollView
      style={[{ flex: 1 }, style]}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flattenStyle));
  return style;
}

// Convertit les raccourcis RN (paddingHorizontal, marginVertical, etc.) en
// propriétés CSS standards — nécessaires quand on passe le style à un <div>
// natif au lieu de passer par le résolveur de React Native Web.
function expandRNShortcuts(s) {
  const out = { ...s };
  const map = {
    paddingHorizontal: ['paddingLeft', 'paddingRight'],
    paddingVertical: ['paddingTop', 'paddingBottom'],
    marginHorizontal: ['marginLeft', 'marginRight'],
    marginVertical: ['marginTop', 'marginBottom'],
  };
  for (const [shortcut, [a, b]] of Object.entries(map)) {
    if (out[shortcut] !== undefined) {
      if (out[a] === undefined) out[a] = out[shortcut];
      if (out[b] === undefined) out[b] = out[shortcut];
      delete out[shortcut];
    }
  }
  return out;
}
