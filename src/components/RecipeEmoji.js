import React from 'react';
import { Platform, Text } from 'react-native';
import { getRecipeEmoji } from '../lib/recipeEmoji';

const EMOJI_FONT =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';

// Rend l'emoji d'une recette de manière cohérente sur tous les écrans.
// Priorité : customEmoji (prop directe) > recipe.custom_emoji > auto depuis title.
export default function RecipeEmoji({ title, recipe, customEmoji, size = 32, style }) {
  const resolvedTitle = title ?? recipe?.title;
  const override = customEmoji ?? recipe?.custom_emoji;
  const char = override && override.trim() ? override : getRecipeEmoji(resolvedTitle);
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
