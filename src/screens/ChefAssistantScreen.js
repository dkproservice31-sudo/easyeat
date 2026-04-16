import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { askCookAssistant } from '../lib/ai';
import { getChatHistory, setChatHistory } from '../lib/chatStore';
import { spacing } from '../theme/theme';

function stripMarkdown(s) {
  if (!s) return '';
  return s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[\*\-•]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

// Sépare un bloc d'étapes en lignes exploitables. On garde l'ordre.
function splitSteps(raw) {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const QUICK = [
  { label: '📋 Plan de préparation optimal', text: 'Donne-moi le plan de préparation optimal pour cette recette.' },
  { label: '🔪 Guide des découpes', text: 'Explique-moi comment couper chaque ingrédient (taille, technique).' },
  { label: '⏱️ Conseils de cuisson', text: 'Donne-moi tes conseils de cuisson pour réussir cette recette.' },
];

export default function ChefAssistantScreen({ route, navigation }) {
  const incomingRecipe = route?.params?.recipe ?? null;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [recipe, setRecipe] = useState(incomingRecipe);
  const [messages, setMessages] = useState(() =>
    getChatHistory(incomingRecipe?.id)
  );

  // Persiste l'historique dans le store mémoire à chaque changement
  useEffect(() => {
    if (recipe?.id) setChatHistory(recipe.id, messages);
  }, [messages, recipe?.id]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Édition des étapes (recettes perso uniquement)
  const [editing, setEditing] = useState(false);
  const [draftSteps, setDraftSteps] = useState([]);
  const [savingSteps, setSavingSteps] = useState(false);
  const scrollRef = useRef(null);

  const isOwner = !!user && recipe?.user_id === user.id;
  const isFeatured = recipe?.featured === true;
  const canEditSteps = isOwner && !isFeatured;

  const openEditor = () => {
    setDraftSteps(splitSteps(recipe?.steps));
    setEditing(true);
  };

  const saveSteps = async () => {
    if (!canEditSteps || !recipe?.id) return;
    setSavingSteps(true);
    const merged = draftSteps
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
    const { data, error } = await supabase
      .from('recipes')
      .update({ steps: merged })
      .eq('id', recipe.id)
      .select('*')
      .single();
    setSavingSteps(false);
    if (error) return notify('Modification impossible', error.message);
    setRecipe(data);
    setEditing(false);
    notify('Enregistré', 'Vos étapes ont été mises à jour.');
  };

  const send = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;
    setInput('');
    const userMsg = { role: 'user', text: trimmed };
    const baseHistory = messages;
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const reply = await askCookAssistant({
        recipe,
        history: baseHistory,
        message: trimmed,
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: stripMarkdown(reply) },
      ]);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err?.message || 'Une erreur est survenue. Réessayez.',
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (!recipe) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Recette introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            👨‍🍳 Assistant Cuisinier
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {canEditSteps && (
          <View style={styles.editSteps}>
            {!editing ? (
              <Pressable
                onPress={openEditor}
                style={({ pressed }) => [
                  styles.editStepsBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.editStepsText}>✏️ Modifier mes étapes</Text>
              </Pressable>
            ) : (
              <View style={styles.editor}>
                <Text style={styles.editorTitle}>Mes étapes</Text>
                {draftSteps.map((s, i) => (
                  <View key={i} style={styles.editorRow}>
                    <Text style={styles.editorIndex}>{i + 1}.</Text>
                    <TextInput
                      value={s}
                      onChangeText={(v) =>
                        setDraftSteps((prev) => {
                          const copy = [...prev];
                          copy[i] = v;
                          return copy;
                        })
                      }
                      multiline
                      editable={!savingSteps}
                      style={styles.editorInput}
                      placeholderTextColor={colors.textHint}
                    />
                    <Pressable
                      onPress={() =>
                        setDraftSteps((prev) => prev.filter((_, j) => j !== i))
                      }
                      disabled={savingSteps}
                      style={styles.editorDeleteBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.editorDeleteText}>×</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() => setDraftSteps((prev) => [...prev, ''])}
                  disabled={savingSteps}
                  style={({ pressed }) => [
                    styles.editorAddBtn,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.editorAddText}>+ Ajouter une étape</Text>
                </Pressable>
                <View style={styles.editorActions}>
                  <Pressable
                    onPress={() => setEditing(false)}
                    disabled={savingSteps}
                    style={({ pressed }) => [
                      styles.editorCancelBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.editorCancelText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveSteps}
                    disabled={savingSteps}
                    style={({ pressed }) => [
                      styles.editorSaveBtn,
                      savingSteps && { opacity: 0.6 },
                      pressed && !savingSteps && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.editorSaveText}>
                      {savingSteps ? 'Sauvegarde...' : 'Sauvegarder'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.length === 0 ? (
            <Text style={styles.empty}>
              Bonjour ! Posez-moi une question sur cette recette, ou utilisez
              les suggestions rapides ci-dessous.
            </Text>
          ) : (
            messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.bubbleRow,
                  m.role === 'user' ? styles.bubbleRowRight : styles.bubbleRowLeft,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                    m.error && { borderColor: colors.danger, borderWidth: 0.5 },
                  ]}
                >
                  <Text
                    style={
                      m.role === 'user'
                        ? styles.bubbleTextUser
                        : styles.bubbleTextAssistant
                    }
                  >
                    {m.text}
                  </Text>
                </View>
              </View>
            ))
          )}
          {sending ? (
            <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
              <View style={[styles.bubble, styles.bubbleAssistant]}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            </View>
          ) : null}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickContent}
          style={styles.quickRow}
        >
          {QUICK.map((q) => (
            <Pressable
              key={q.label}
              onPress={() => send(q.text)}
              disabled={sending}
              style={({ pressed }) => [
                styles.quickBtn,
                pressed && !sending && { opacity: 0.85 },
                sending && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.quickText}>{q.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Votre question..."
            placeholderTextColor={colors.textHint}
            style={styles.input}
            editable={!sending}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send()}
            disabled={sending || !input.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              (sending || !input.trim()) && { opacity: 0.5 },
              pressed && !sending && input.trim() && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.sendText}>Envoyer</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    emptyText: { color: colors.textSecondary, fontSize: 14 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backText: { fontSize: 22, color: colors.primary, fontWeight: '700' },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    headerSpacer: { width: 36 },

    editSteps: {
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    editStepsBtn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    editStepsText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    editor: {
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
    },
    editorTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    editorRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 6,
    },
    editorIndex: {
      marginTop: 8,
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      width: 22,
    },
    editorInput: {
      flex: 1,
      minHeight: 40,
      backgroundColor: colors.background,
      borderWidth: 0.5,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.text,
      fontSize: 14,
      textAlignVertical: 'top',
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
    },
    editorDeleteBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerLight,
      marginTop: 6,
    },
    editorDeleteText: { color: colors.dangerText, fontSize: 16, fontWeight: '700' },
    editorAddBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.primaryLight,
      marginTop: 6,
    },
    editorAddText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
    editorActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    editorCancelBtn: {
      flex: 1,
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 0.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editorCancelText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    editorSaveBtn: {
      flex: 1.4,
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editorSaveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

    messages: { flex: 1 },
    messagesContent: { padding: 12, gap: 10 },
    empty: {
      color: colors.textSecondary,
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingTop: 40,
      paddingHorizontal: 24,
      lineHeight: 20,
    },
    bubbleRow: { flexDirection: 'row' },
    bubbleRowLeft: { justifyContent: 'flex-start' },
    bubbleRowRight: { justifyContent: 'flex-end' },
    bubble: {
      maxWidth: '85%',
      borderRadius: 14,
      padding: 14,
    },
    bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border },
    bubbleUser: { backgroundColor: colors.primary },
    bubbleTextAssistant: { fontSize: 15, color: colors.text, lineHeight: 22 },
    bubbleTextUser: {
      fontSize: 15,
      color: '#FFFFFF',
      lineHeight: 22,
      fontWeight: '600',
    },

    quickRow: {
      flexGrow: 0,
      flexShrink: 0,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    quickContent: { gap: 6, padding: 8 },
    quickBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
    },
    quickText: { fontSize: 12, color: colors.primary, fontWeight: '700' },

    inputRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 8,
      backgroundColor: colors.surface,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      minHeight: 44,
      backgroundColor: colors.background,
      borderWidth: 0.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      fontSize: 16,
      color: colors.text,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
    },
    sendBtn: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  });
