import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function ScanChoiceModal({ visible, onClose, onTicket, onFridge }) {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation && e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.text }]}>
            Que veux-tu scanner ?
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Choisis ce que tu as sous la main
          </Text>

          <Pressable
            onPress={onTicket}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.optionEmoji}>🧾</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                Scanner un ticket
              </Text>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                Photo de ton ticket → ajout automatique des courses
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.primary }]}>›</Text>
          </Pressable>

          <Pressable
            onPress={onFridge}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.optionEmoji}>🧊</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                Scanner mon frigo
              </Text>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                Photo de ton frigo ouvert → identification auto des aliments
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.primary }]}>›</Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              Annuler
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderWidth: 0.5,
    gap: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginBottom: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 0.5,
  },
  optionEmoji: { fontSize: 28 },
  optionTitle: { fontSize: 15, fontWeight: '700' },
  optionDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  chevron: { fontSize: 22, fontWeight: '700' },
  cancel: { alignItems: 'center', padding: 14, marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '700' },
});
