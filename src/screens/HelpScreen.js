import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import Screen from '../components/Screen';
import { useTheme } from '../contexts/ThemeContext';
import { spacing } from '../theme/theme';

const SECTIONS = [
  {
    title: '🏠 Accueil',
    items: [
      'Recettes populaires classées par pays avec drapeaux',
      'Filtres par type de plat (viande, poisson, vegan, végétarien, dessert)',
      'Recherche globale avec filtres par pays et type',
      'Ajout de recettes à votre collection personnelle',
      'Notes et étoiles visibles sur chaque recette',
    ],
  },
  {
    title: '📖 Recettes',
    items: [
      'Créer une recette manuellement ou via l\'IA',
      'Filtrer par type de plat',
      'Swipe pour supprimer, croix pour supprimer',
      'Suggérer une recette à l\'admin avec le bouton 💡',
      'Ouvrir une recette pour voir les détails, ingrédients et étapes',
    ],
  },
  {
    title: '👨\u200d🍳 Assistant Cuisinier',
    items: [
      'Disponible sur chaque recette ouverte',
      'Plan de préparation optimal',
      'Guide des découpes',
      'Conseils de cuisson personnalisés',
      'Modifier vos étapes de recette personnelle',
    ],
  },
  {
    title: '📊 Macronutriments',
    items: [
      'Bouton « Voir les macronutriments » sur chaque recette',
      'Calories, protéines, glucides, lipides par portion et au total',
      'Appui long sur un ingrédient pour ses macros individuelles',
    ],
  },
  {
    title: '❄️ Mon Frigo',
    items: [
      'Ajouter / modifier / supprimer des ingrédients',
      'Quantités et unités personnalisables',
      'Indicateur vert / rouge sur les recettes',
    ],
  },
  {
    title: '🛒 Mes Courses',
    items: [
      'Liste de courses liée aux recettes et au frigo',
      'Cocher les ingrédients achetés',
      'Historique des courses',
    ],
  },
  {
    title: '✨ Studio IA',
    items: [
      'Générer des recettes selon vos envies',
      'Choisir le nombre de personnes',
      'Utiliser les ingrédients de votre frigo',
      'Adapter les portions d\'une recette existante',
    ],
  },
  {
    title: '⭐ Notes et avis',
    items: [
      'Noter chaque recette de 1 à 5 étoiles',
      'Laisser un commentaire',
      'Voir les avis des autres utilisateurs',
      'Les meilleures recettes sont mises en avant',
    ],
  },
  {
    title: '👤 Profil',
    items: [
      'Statistiques de vos recettes par type',
      'Bilan macronutriments IA global',
      'Mode sombre',
      'Guide d\'utilisation et aide',
      'Nous contacter',
    ],
  },
];

function AccordionSection({ title, items, styles, colors }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCaret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.sectionBody}>
          {items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemBullet}>•</Text>
              <Text style={styles.itemText}>{it}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function HelpScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Screen>
      <Text style={styles.title}>❓ Aide</Text>
      <Text style={styles.hint}>
        Tapez une section pour en savoir plus.
      </Text>
      <View style={{ gap: 10, marginTop: spacing.md }}>
        {SECTIONS.map((s) => (
          <AccordionSection
            key={s.title}
            title={s.title}
            items={s.items}
            styles={styles}
            colors={colors}
          />
        ))}
      </View>
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
    },
    hint: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    sectionCaret: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: '700',
    },
    sectionBody: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      gap: 6,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    itemBullet: {
      color: colors.primary,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
    },
    itemText: {
      flex: 1,
      color: colors.text,
      fontSize: 13,
      lineHeight: 20,
    },
  });
