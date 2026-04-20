import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function normalizeRecipeSnapshot(recipe) {
  if (!recipe || typeof recipe !== 'object') return null;
  // Tolère 2 formats : recipe avec name (format WeeklyMenu/IA) ou title (format Supabase)
  const name = recipe.name || recipe.title || 'Recette';
  return {
    name,
    time: recipe.time || (recipe.duration ? `${recipe.duration} min` : null),
    servings: recipe.servings || null,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions)
      ? recipe.instructions
      : Array.isArray(recipe.steps)
      ? recipe.steps
      : [],
    source_id: recipe.id || null,
  };
}

export default function AddToPlanButton({ recipe, onAdded, label }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleDaySelect = async (offsetFromToday) => {
    if (!user || !recipe) return;
    setSaving(true);

    const target = new Date(today);
    target.setDate(today.getDate() + offsetFromToday);
    const dateISO = target.toISOString().split('T')[0];

    const snapshot = normalizeRecipeSnapshot(recipe);
    if (!snapshot) {
      setSaving(false);
      notify('Ajout impossible', 'Recette invalide.');
      return;
    }

    const { error } = await supabase.from('planned_meals').insert({
      user_id: user.id,
      planned_date: dateISO,
      recipe_snapshot: snapshot,
    });

    setSaving(false);
    setModalVisible(false);

    if (error) {
      notify('Erreur', error.message);
    } else {
      notify('Ajouté au planning ! 📅', `${snapshot.name} · ${target.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`);
      if (typeof onAdded === 'function') onAdded();
    }
  };

  // 7 prochains jours (incluant aujourd'hui)
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      offset: i,
      dayName: DAY_LABELS[(d.getDay() + 6) % 7],
      dateNum: d.getDate(),
      isToday: i === 0,
    };
  });

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [
          styles.addBtn,
          { backgroundColor: colors.primary },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Ajouter au planning"
      >
        <Text style={styles.addBtnText}>📅 {label || 'Ajouter au planning'}</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onPress={(e) => {
              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            }}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Choisis un jour
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Pour les 7 prochains jours
            </Text>

            <View style={styles.daysGrid}>
              {next7Days.map((d) => (
                <Pressable
                  key={d.offset}
                  onPress={() => handleDaySelect(d.offset)}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.dayBtn,
                    { borderColor: colors.border, backgroundColor: colors.background },
                    d.isToday && { borderColor: colors.primary, borderWidth: 2 },
                    pressed && !saving && { opacity: 0.7 },
                    saving && { opacity: 0.5 },
                  ]}
                >
                  <Text style={[styles.dayBtnLabel, { color: colors.textSecondary }]}>
                    {d.dayName}
                  </Text>
                  <Text style={[styles.dayBtnNum, { color: colors.text }]}>
                    {d.dateNum}
                  </Text>
                </Pressable>
              ))}
            </View>

            {saving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.savingText, { color: colors.textSecondary }]}>
                  Ajout au planning...
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setModalVisible(false)}
                style={{ marginTop: 16, alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
                  Annuler
                </Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  dayBtn: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dayBtnNum: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  savingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
