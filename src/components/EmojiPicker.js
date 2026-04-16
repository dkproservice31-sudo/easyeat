import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// Emojis alimentaires courants — sélection partagée entre AdminScreen et
// AdminEditFeaturedScreen.
export const FOOD_EMOJIS = [
  '🍽️','🍴','🥩','🍗','🐟','🦐','🦪','🦞','🦀','🫛','🍝',
  '🍕','🍔','🌮','🥗','🍲','🍜','🍛','🍣','🍱','🥘',
  '🫕','🧆','🥟','🥙','🌯','🫔','🥖','🍞','🥐','🥯',
  '🧀','🥚','🍳','🥞','🧇','🍰','🎂','🧁','🥮','🍮',
  '🍩','🍪','🍫','🍬','🍭','🍇','🍈','🍉','🍊','🍋',
  '🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐',
  '🥝','🍅','🫒','🥑','🥦','🥬','🥒','🌶️','🫑','🌽',
  '🥕','🧄','🧅','🥔','🍠','🫘','🥜','☕','🍵','🧃',
  '🥤','🍷','🍺','🧈','🫓','🍢','🎃',
];

const EMOJI_FONT =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';

function EmojiCell({ emoji, onPress, active }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onPress(emoji)}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active
            ? colors.primaryLight
            : pressed
            ? colors.primaryLight
            : 'transparent',
          borderWidth: active ? 1 : 0,
          borderColor: colors.primary,
        },
      ]}
    >
      {Platform.OS === 'web'
        ? React.createElement(
            'span',
            {
              style: {
                fontSize: 24,
                lineHeight: 1,
                fontFamily: EMOJI_FONT,
              },
            },
            emoji
          )
        : <Text style={{ fontSize: 24 }}>{emoji}</Text>}
    </Pressable>
  );
}

export default function EmojiPicker({ visible, onSelect, onClose, current }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Choisir un emoji</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 320 }}>
            <View style={styles.grid}>
              {FOOD_EMOJIS.map((e) => (
                <EmojiCell
                  key={e}
                  emoji={e}
                  active={e === current}
                  onPress={(v) => {
                    onSelect(v);
                    onClose?.();
                  }}
                />
              ))}
            </View>
          </ScrollView>

          {current ? (
            <Pressable
              onPress={() => {
                onSelect(null);
                onClose?.();
              }}
              style={({ pressed }) => [
                styles.resetBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.resetText}>
                Retirer l'emoji personnalisé
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    closeText: {
      fontSize: 20,
      color: colors.textSecondary,
      lineHeight: 22,
      marginTop: -2,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      justifyContent: 'center',
    },
    resetBtn: {
      marginTop: 10,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 0.5,
      borderColor: colors.border,
      alignItems: 'center',
    },
    resetText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '700',
    },
  });
