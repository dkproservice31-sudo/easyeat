import React from 'react';
import { Text } from 'react-native';
import Screen from '../components/Screen';
import { typography } from '../theme/theme';

export default function RecipesScreen() {
  return (
    <Screen>
      <Text style={typography.h1}>Recettes</Text>
      <Text style={typography.small}>Liste des recettes à venir.</Text>
    </Screen>
  );
}
