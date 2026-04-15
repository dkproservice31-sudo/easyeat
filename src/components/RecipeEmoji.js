import React from 'react';
import { Platform, Text } from 'react-native';
import { getRecipeEmoji } from '../lib/recipeEmoji';

const EMOJI_FONT =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';

// Rend l'emoji d'une recette de manière cohérente sur tous les écrans.
// Sur web, on utilise un <span> natif pour forcer la police emoji via style
// inline (RN Web ne propage pas toujours fontFamily correctement sur Text).
export default function RecipeEmoji({ title, size = 32, style }) {
  const char = getRecipeEmoji(title);
  if (Platform.OS === 'web') {
    return React.createElement(
      'span',
      {
        style: {
          fontSize: size,
          lineHeight: 1,
          fontFamily: EMOJI_FONT,
          display: 'inline-block',
          textAlign: 'center',
          ...flatten(style),
        },
      },
      char
    );
  }
  return <Text style={[{ fontSize: size }, style]}>{char}</Text>;
}

function flatten(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style;
}
