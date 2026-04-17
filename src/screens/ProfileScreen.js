import React, { useCallback, useMemo, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Screen from '../components/Screen';
import FadeInView from '../components/FadeInView';
import TutorialModal from '../components/TutorialModal';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { analyzeNutritionBalance } from '../lib/ai';
import { AIQuotaExceededError } from '../lib/aiQuota';
import { DISH_TYPES, normalizeDishType } from '../lib/dishTypes';
import { spacing } from '../theme/theme';

function StatCard({ emoji, value, label, styles }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ThemeToggle({ isDark, onToggle, styles, colors }) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.themeRow,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityLabel="Basculer le mode sombre"
    >
      <View style={styles.themeLabelWrap}>
        <Text style={styles.themeEmoji}>🌙</Text>
        <Text style={styles.themeLabel}>Mode sombre</Text>
      </View>
      <View
        style={[
          styles.toggleTrack,
          { backgroundColor: isDark ? colors.primary : colors.border },
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            { alignSelf: isDark ? 'flex-end' : 'flex-start' },
          ]}
        />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { user, profile, signOut, isAdmin, isEditor } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const [stats, setStats] = useState({ recipes: 0, fridge: 0, ai: 0 });
  const [dishCounts, setDishCounts] = useState({});
  const [nutritionText, setNutritionText] = useState(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);

  // Modale contact + compteur de messages non lus (admin uniquement)
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubject, setContactSubject] = useState('Signaler un bug');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const CONTACT_SUBJECTS = [
    'Signaler un bug',
    'Suggestion d\'amélioration',
    'Question',
    'Autre',
  ];

  const submitContact = async () => {
    if (!user) return;
    if (!contactMessage.trim()) {
      notify('Message requis', 'Merci de décrire votre demande.');
      return;
    }
    setContactSending(true);
    const { error } = await supabase.from('contact_messages').insert({
      user_id: user.id,
      subject: contactSubject,
      message: contactMessage.trim(),
    });
    setContactSending(false);
    if (error) return notify('Envoi impossible', error.message);
    setContactOpen(false);
    setContactMessage('');
    setContactSubject('Signaler un bug');
    notify('Merci !', 'Votre message a été envoyé !');
  };

  const notify = (title, message) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const loadNutrition = async () => {
    if (!user) return;
    setNutritionLoading(true);
    setNutritionText(null);
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('title, ingredients')
        .eq('user_id', user.id)
        .or('featured.is.null,featured.eq.false');
      if (error) throw error;
      if (!data || data.length === 0) {
        setNutritionText(
          'Vous n\'avez pas encore de recettes personnelles à analyser.'
        );
        return;
      }
      const txt = await analyzeNutritionBalance({ recipes: data, userId: user?.id });
      setNutritionText(txt);
    } catch (err) {
      if (err instanceof AIQuotaExceededError) {
        notify(
          'Limite IA atteinte',
          "Tu as utilisé tes 20 générations IA aujourd'hui. Reviens demain !"
        );
      } else {
        notify('Analyse impossible', err.message || 'Erreur');
      }
    } finally {
      setNutritionLoading(false);
    }
  };

  const username =
    profile?.username || user?.email?.split('@')[0] || 'Utilisateur';
  const initial = (username || '?').charAt(0).toUpperCase();

  const loadStats = useCallback(async () => {
    if (!user) return;
    const [recipesRes, fridgeRes, aiRes] = await Promise.all([
      supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or('featured.is.null,featured.eq.false'),
      supabase
        .from('fridge_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('generated_by_ai', true)
        .or('featured.is.null,featured.eq.false'),
    ]);
    setStats({
      recipes: recipesRes.count ?? 0,
      fridge: fridgeRes.count ?? 0,
      ai: aiRes.count ?? 0,
    });

    // Répartition par dish_type (recettes perso)
    const { data: dishRows } = await supabase
      .from('recipes')
      .select('dish_type')
      .eq('user_id', user.id)
      .or('featured.is.null,featured.eq.false');
    const counts = {};
    for (const r of dishRows || []) {
      const k = normalizeDishType(r.dish_type);
      if (!k || k === 'tout') continue;
      counts[k] = (counts[k] || 0) + 1;
    }
    setDishCounts(counts);

    // Messages non lus — admin uniquement (RLS renverra vide sinon)
    if (isAdmin) {
      const { count } = await supabase
        .from('contact_messages')
        .select('id', { count: 'exact', head: true })
        .eq('read', false);
      setUnreadMessages(count || 0);
    } else {
      setUnreadMessages(0);
    }
  }, [user, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  return (
    <Screen>
      <View style={styles.container}>
        <FadeInView delay={0}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Text style={styles.name}>{username}</Text>
            {user?.email ? (
              <Text style={styles.email}>{user.email}</Text>
            ) : null}
          </View>
        </FadeInView>

        {isEditor && (
          <FadeInView delay={80}>
            <Pressable
              onPress={() => navigation.navigate('Admin')}
              style={({ pressed }) => [
                styles.adminBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel={isAdmin ? 'Panneau Admin' : 'Panneau Éditeur'}
            >
              <Text style={styles.adminBtnText}>
                🔧 {isAdmin ? 'Panneau Admin' : 'Panneau Éditeur'}
              </Text>
              {isAdmin && unreadMessages > 0 ? (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>{unreadMessages}</Text>
                </View>
              ) : null}
            </Pressable>
          </FadeInView>
        )}

        <FadeInView delay={120}>
          <View style={styles.statsRow}>
            <StatCard emoji="📖" value={stats.recipes} label="Recettes" styles={styles} />
            <StatCard emoji="❄️" value={stats.fridge} label="Frigo" styles={styles} />
            <StatCard emoji="✨" value={stats.ai} label="IA" styles={styles} />
          </View>
        </FadeInView>

        <FadeInView delay={160}>
          <Text style={styles.sectionTitle}>📊 Mes statistiques</Text>
          <Text style={styles.sectionSubtitle}>
            Répartition de vos recettes personnelles
          </Text>
          <View style={styles.dishGrid}>
            {DISH_TYPES.map((d) => (
              <View key={d.key} style={styles.dishStatCard}>
                <Text style={styles.dishStatEmoji}>{d.emoji}</Text>
                <Text style={styles.dishStatLabel}>{d.label}</Text>
                <Text style={styles.dishStatValue}>{dishCounts[d.key] || 0}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={loadNutrition}
            disabled={nutritionLoading}
            style={({ pressed }) => [
              styles.nutritionBtn,
              pressed && !nutritionLoading && { opacity: 0.85 },
              nutritionLoading && { opacity: 0.6 },
            ]}
          >
            {nutritionLoading ? (
              <View style={styles.nutritionBtnInner}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.nutritionBtnText}>Analyse en cours...</Text>
              </View>
            ) : (
              <Text style={styles.nutritionBtnText}>
                📊 Bilan macronutriments
              </Text>
            )}
          </Pressable>
          <Text style={styles.nutritionHint}>
            Analyse globale de vos habitudes alimentaires par l'IA
          </Text>

          {nutritionText && !nutritionLoading ? (
            <FadeInView>
              <View style={styles.nutritionCard}>
                <Text style={styles.nutritionText}>{nutritionText}</Text>
                <Pressable
                  onPress={() => setNutritionText(null)}
                  style={({ pressed }) => [
                    styles.nutritionCloseBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.nutritionCloseText}>Fermer</Text>
                </Pressable>
              </View>
            </FadeInView>
          ) : null}
        </FadeInView>

        <FadeInView delay={170}>
          <Pressable
            onPress={() => setTutorialOpen(true)}
            style={({ pressed }) => [
              styles.infoCard,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Guide d'utilisation"
          >
            <Text style={styles.infoEmoji}>📖</Text>
            <Text style={styles.infoTitle}>Guide d'utilisation</Text>
            <Text style={styles.infoChevron}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Help')}
            style={({ pressed }) => [
              styles.infoCard,
              { marginTop: 10 },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Aide"
          >
            <Text style={styles.infoEmoji}>❓</Text>
            <Text style={styles.infoTitle}>Aide</Text>
            <Text style={styles.infoChevron}>›</Text>
          </Pressable>
        </FadeInView>

        <FadeInView delay={180}>
          <ThemeToggle
            isDark={isDark}
            onToggle={toggleTheme}
            styles={styles}
            colors={colors}
          />
        </FadeInView>

        <FadeInView delay={200}>
          <Pressable
            onPress={() => setContactOpen(true)}
            style={({ pressed }) => [
              styles.contactCard,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Nous contacter"
          >
            <Text style={styles.contactEmoji}>📩</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactTitle}>Nous contacter</Text>
              <Text style={styles.contactHint}>
                Bug, suggestion, question...
              </Text>
            </View>
            <Text style={styles.contactChevron}>›</Text>
          </Pressable>
        </FadeInView>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Se déconnecter"
        >
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </Pressable>
      </View>

      <TutorialModal
        visible={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />

      <Modal
        visible={contactOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setContactOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nous contacter</Text>
            <Text style={styles.modalSubtitle}>
              Signaler un bug, suggérer une amélioration ou poser une question
            </Text>

            <Text style={styles.modalLabel}>Objet</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subjectChipsContent}
              style={styles.subjectChipsRow}
            >
              {CONTACT_SUBJECTS.map((s) => {
                const active = contactSubject === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setContactSubject(s)}
                    style={({ pressed }) => [
                      styles.subjectChip,
                      active && styles.subjectChipActive,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.subjectChipText,
                        active && styles.subjectChipTextActive,
                      ]}
                    >
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.modalLabel}>Message</Text>
            <TextInput
              value={contactMessage}
              onChangeText={setContactMessage}
              placeholder="Décrivez votre demande..."
              placeholderTextColor={colors.textHint}
              style={styles.modalMessage}
              multiline
              numberOfLines={5}
              maxLength={1000}
              textAlignVertical="top"
              editable={!contactSending}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setContactOpen(false)}
                disabled={contactSending}
                style={({ pressed }) => [
                  styles.modalCancelBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={submitContact}
                disabled={contactSending}
                style={({ pressed }) => [
                  styles.modalSubmitBtn,
                  contactSending && { opacity: 0.6 },
                  pressed && !contactSending && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalSubmitText}>
                  {contactSending ? 'Envoi...' : 'Envoyer'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
    },
    header: { alignItems: 'center' },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },
    name: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginTop: 12,
      textAlign: 'center',
    },
    email: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: 24,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 14,
      alignItems: 'center',
    },
    statEmoji: { fontSize: 22 },
    statValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginTop: 4,
    },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginTop: 24,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: 10,
    },
    dishGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    dishStatCard: {
      flexBasis: '31%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    dishStatEmoji: { fontSize: 20 },
    dishStatLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
      fontWeight: '600',
    },
    dishStatValue: {
      fontSize: 18,
      color: colors.text,
      fontWeight: '700',
      marginTop: 4,
    },
    nutritionBtn: {
      marginTop: 12,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    nutritionBtnInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    nutritionBtnText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    nutritionHint: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 6,
      textAlign: 'center',
    },
    nutritionCard: {
      marginTop: 12,
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
    },
    nutritionText: {
      fontSize: 13,
      color: colors.text,
      lineHeight: 19,
    },
    nutritionCloseBtn: {
      alignSelf: 'center',
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    nutritionCloseText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
    },

    themeRow: {
      marginTop: 16,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    themeLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    themeEmoji: { fontSize: 18 },
    themeLabel: { fontSize: 15, color: colors.text, fontWeight: '600' },
    toggleTrack: {
      width: 44,
      height: 24,
      borderRadius: 12,
      padding: 2,
      justifyContent: 'center',
    },
    toggleThumb: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },

    adminBtn: {
      marginTop: 20,
      minHeight: 50,
      borderRadius: 12,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    adminBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    adminBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.danger,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    adminBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    infoCard: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    infoEmoji: { fontSize: 20 },
    infoTitle: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      fontWeight: '700',
    },
    infoChevron: { fontSize: 22, color: colors.primary, fontWeight: '700' },
    contactCard: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    contactEmoji: { fontSize: 22 },
    contactTitle: { fontSize: 15, color: colors.text, fontWeight: '700' },
    contactHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    contactChevron: { fontSize: 22, color: colors.primary, fontWeight: '700' },

    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    modalCard: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    modalSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: 12,
    },
    modalLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginTop: 10,
      marginBottom: 6,
    },
    subjectChipsRow: { flexGrow: 0, flexShrink: 0 },
    subjectChipsContent: { gap: 6, paddingVertical: 2 },
    subjectChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    subjectChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    subjectChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '700' },
    subjectChipTextActive: { color: '#FFFFFF' },
    modalMessage: {
      minHeight: 100,
      backgroundColor: colors.background,
      borderWidth: 0.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      fontSize: 16,
      color: colors.text,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
    },
    modalCancelBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 0.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelText: { color: colors.text, fontSize: 14, fontWeight: '700' },
    modalSubmitBtn: {
      flex: 1.4,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

    signOutBtn: {
      minHeight: 50,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  });
