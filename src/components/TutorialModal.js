import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import FadeInView from './FadeInView';

const SLIDES = [
  {
    emoji: '🏠',
    title: 'Accueil',
    text:
      'Découvrez des recettes du monde entier, classées par pays et par type (viande, poisson, vegan...). Utilisez la recherche pour trouver la recette parfaite !',
  },
  {
    emoji: '📖',
    title: 'Mes Recettes',
    text:
      'Ajoutez des recettes depuis le catalogue ou créez les vôtres. Filtrez par type de plat, notez vos recettes favorites avec des étoiles ⭐ et suggérez-en de nouvelles !',
  },
  {
    emoji: '👨‍🍳',
    title: 'Assistant Cuisinier',
    text:
      'Ouvrez une recette et consultez notre assistant IA. Il vous guide sur la préparation, les découpes, les temps de cuisson et les astuces de chef !',
  },
  {
    emoji: '📊',
    title: 'Macronutriments',
    text:
      'Consultez les calories, protéines, glucides et lipides de chaque recette ou ingrédient. Appui long sur un ingrédient pour ses macros !',
  },
  {
    emoji: '❄️',
    title: 'Mon Frigo',
    text:
      "Gérez vos ingrédients en stock. L'app vous indique ce qui manque pour chaque recette avec des pastilles vertes et rouges !",
  },
  {
    emoji: '🛒',
    title: 'Mes Courses',
    text:
      'Votre liste de courses intelligente, liée à vos recettes et votre frigo. Cochez au fur et à mesure !',
  },
  {
    emoji: '✨',
    title: 'Studio IA',
    text:
      'Notre IA génère des recettes sur mesure selon vos envies, le nombre de personnes et les ingrédients de votre frigo !',
  },
  {
    emoji: '👤',
    title: 'Profil',
    text:
      "Vos statistiques, le mode sombre, le bilan nutritionnel IA, le guide d'utilisation et contactez-nous !",
  },
  {
    emoji: '🎉',
    title: "C'est parti !",
    text: 'Vous êtes prêt·e à explorer EasyEat. Bonne cuisine !',
    final: true,
  },
];

function SlideCard({ slide, styles, onFinish }) {
  return (
    <FadeInView>
      <View style={styles.slideCard}>
        <Text style={styles.slideEmoji}>{slide.emoji}</Text>
        <Text style={styles.slideTitle}>{slide.title}</Text>
        <Text style={styles.slideText}>{slide.text}</Text>
        {slide.final ? (
          <Pressable
            onPress={onFinish}
            style={({ pressed }) => [
              styles.finishBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.finishBtnText}>Commencer à cuisiner</Text>
          </Pressable>
        ) : null}
      </View>
    </FadeInView>
  );
}

export default function TutorialModal({ visible, onClose, showWelcome = false }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [stage, setStage] = useState(showWelcome ? 'welcome' : 'slides');
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);
  const winWidth = Dimensions.get('window').width;
  const slideWidth = Math.min(winWidth, 440);

  const resetAndClose = () => {
    setIndex(0);
    setStage(showWelcome ? 'welcome' : 'slides');
    onClose?.();
  };

  const startSlides = () => {
    setStage('slides');
    setIndex(0);
    setTimeout(() => {
      scrollRef.current?.scrollTo?.({ x: 0, animated: false });
    }, 0);
  };

  const goTo = (i) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
    setIndex(clamped);
    scrollRef.current?.scrollTo?.({ x: clamped * slideWidth, animated: true });
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={resetAndClose}
    >
      <View style={styles.root}>
        {stage === 'welcome' ? (
          <View style={styles.welcomeWrap}>
            <Text style={styles.welcomeEmoji}>🍽️</Text>
            <Text style={styles.welcomeTitle}>Bienvenue sur EasyEat !</Text>
            <Text style={styles.welcomeSub}>
              Prêt·e à découvrir l'app en quelques étapes ?
            </Text>
            <Pressable
              onPress={startSlides}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Découvrir l'app</Text>
            </Pressable>
            <Pressable
              onPress={resetAndClose}
              style={({ pressed }) => [
                styles.ghostBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.ghostBtnText}>Passer</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={slideWidth}
              snapToAlignment="start"
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={(e) => {
                const i = Math.round(
                  e.nativeEvent.contentOffset.x / slideWidth
                );
                if (i !== index) setIndex(i);
              }}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(
                  e.nativeEvent.contentOffset.x / slideWidth
                );
                setIndex(i);
              }}
              style={{ flex: 1 }}
            >
              {SLIDES.map((s, i) => (
                <View key={i} style={[styles.slide, { width: slideWidth }]}>
                  <SlideCard slide={s} styles={styles} onFinish={resetAndClose} />
                </View>
              ))}
            </ScrollView>

            <View style={styles.dotsRow}>
              {SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === index && styles.dotActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.navRow}>
              <Pressable
                onPress={() => goTo(index - 1)}
                disabled={index === 0}
                style={({ pressed }) => [
                  styles.navBtn,
                  index === 0 && { opacity: 0.3 },
                  pressed && index !== 0 && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.navBtnText}>Précédent</Text>
              </Pressable>
              {index < SLIDES.length - 1 ? (
                <Pressable
                  onPress={() => goTo(index + 1)}
                  style={({ pressed }) => [
                    styles.primaryBtnSmall,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>Suivant</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={resetAndClose}
                  style={({ pressed }) => [
                    styles.primaryBtnSmall,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>Terminer</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={resetAndClose}
              style={styles.skipBtn}
              hitSlop={8}
            >
              <Text style={styles.skipText}>Passer</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'web' ? 0 : 40,
    },
    welcomeWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    welcomeEmoji: { fontSize: 72 },
    welcomeTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginTop: 8,
    },
    welcomeSub: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    slide: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: '7.5%',
    },
    slideCard: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 20,
      paddingVertical: 30,
      paddingHorizontal: 26,
      alignItems: 'center',
      gap: 14,
    },
    slideEmoji: { fontSize: 60, textAlign: 'center' },
    slideTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.primary,
      textAlign: 'center',
    },
    slideText: {
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
      lineHeight: 22,
    },
    finishBtn: {
      marginTop: 18,
      alignSelf: 'stretch',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    finishBtnText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '700',
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.primary,
      width: 20,
    },
    navRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    navBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    navBtnText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    primaryBtn: {
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 200,
    },
    primaryBtnSmall: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    ghostBtn: { paddingHorizontal: 24, paddingVertical: 12 },
    ghostBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
    skipBtn: {
      position: 'absolute',
      top: Platform.OS === 'web' ? 16 : 48,
      right: 20,
      padding: 8,
    },
    skipText: {
      color: colors.textTertiary,
      fontSize: 12,
      fontWeight: '600',
    },
  });
