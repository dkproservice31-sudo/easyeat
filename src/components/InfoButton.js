import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function InfoButton({ title, description, size = 18 }) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={(e) => {
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          setVisible(true);
        }}
        hitSlop={10}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="En savoir plus"
      >
        <Text
          style={[styles.icon, { color: colors.textSecondary, fontSize: size }]}
        >
          ⓘ
        </Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable
            style={[styles.content, { backgroundColor: colors.surface }]}
            onPress={(e) => {
              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            }}
          >
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {description}
            </Text>
            <Pressable
              onPress={() => setVisible(false)}
              style={({ pressed }) => [
                styles.okBtn,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.okBtnText}>Compris</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
  icon: {
    fontWeight: '500',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  okBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  okBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
