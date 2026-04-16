import React, { useLayoutEffect, useMemo, useState, useEffect } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Dimensions,
} from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import ServingsSelector from '../components/ServingsSelector';
import RecipePreview from '../components/RecipePreview';
import StepsList from '../components/StepsList';
import IngredientsList from '../components/IngredientsList';
import RecipeEmoji from '../components/RecipeEmoji';
import FadeInView from '../components/FadeInView';
import { formatDuration } from '../lib/formatDuration';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  adjustRecipeServings,
  calculateRecipeMacros,
  askCookAssistant,
} from '../lib/ai';
import { getCountryFlag } from '../lib/countryFlags';
import { clearChatHistory } from '../lib/chatStore';
import { radius, spacing } from '../theme/theme';

// Retire les mentions de portions d'un titre :
//   "(pour 2 personnes)", "(2 pers.)", "(pour 4 pers.)", "pour 2 personnes",
//   "2 personnes", "2 pers.", "(2 personnes)", etc.
function stripServings(title) {
  if (!title) return title;
  let t = title;
  // Entre parenthèses (avec ou sans "pour")
  t = t.replace(
    /\s*\(\s*(?:pour\s+)?\d+\s*(?:personnes?|pers\.?)\s*\)/gi,
    ''
  );
  // Sans parenthèses, avec "pour"
  t = t.replace(/\s+pour\s+\d+\s+(?:personnes?|pers\.?)/gi, '');
  // Sans parenthèses, sans "pour" (ex : "Tarte 4 personnes")
  t = t.replace(/\s+\d+\s+(?:personnes?|pers\.?)\b/gi, '');
  // Nettoie les parenthèses vides résiduelles
  t = t.replace(/\(\s*\)/g, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

function confirmDialog(title, message) {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function InfoPill({ label, value, styles }) {
  if (!value) return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children, styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function stripMarkdown(s) {
  if (!s) return '';
  return s
    .replace(/^#{1,6}\s+/gm, '') // # Titres
    .replace(/^\s*[-*_]{3,}\s*$/gm, '') // --- séparateurs
    .replace(/\*\*(.+?)\*\*/g, '$1') // **gras**
    .replace(/__(.+?)__/g, '$1') // __gras__
    .replace(/\*(.+?)\*/g, '$1') // *italique*
    .replace(/_(.+?)_/g, '$1') // _italique_
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/^\s*[\*\-•]\s+/gm, '• ') // listes → puce simple
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function CookAssistant({ recipe, styles, colors }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

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
      setMessages((prev) => [...prev, { role: 'assistant', text: stripMarkdown(reply) }]);
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

  const QUICK = [
    { label: '📋 Plan de préparation optimal', text: 'Donne-moi le plan de préparation optimal pour cette recette.' },
    { label: '🔪 Guide des découpes', text: 'Explique-moi comment couper chaque ingrédient (taille, technique).' },
    { label: '⏱️ Conseils de cuisson', text: 'Donne-moi tes conseils de cuisson pour réussir cette recette.' },
  ];

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.assistantOpenBtn,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.assistantOpenText}>👨‍🍳 Assistant Cuisinier</Text>
      </Pressable>
    );
  }

  const screenH = Dimensions.get('window').height;
  const cardHeight = Math.min(500, Math.round(screenH * 0.6));

  return (
    <View style={[styles.chatCard, { height: cardHeight }]}>
      <View style={styles.chatHeader}>
        <Text style={styles.chatHeaderTitle}>👨‍🍳 Assistant Cuisinier</Text>
        <Pressable
          onPress={() => setOpen(false)}
          style={({ pressed }) => [
            styles.chatCloseBtn,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={8}
        >
          <Text style={styles.chatCloseText}>Fermer ×</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.chatMessages}
        contentContainerStyle={styles.chatMessagesContent}
        showsVerticalScrollIndicator
      >
        {messages.length === 0 ? (
          <Text style={styles.chatEmpty}>
            Posez une question, ou utilisez les suggestions ci-dessous.
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
        contentContainerStyle={styles.chatQuickContent}
        style={styles.chatQuickScroll}
      >
        {QUICK.map((q) => (
          <Pressable
            key={q.label}
            onPress={() => send(q.text)}
            disabled={sending}
            style={({ pressed }) => [
              styles.chatQuickBtn,
              pressed && !sending && { opacity: 0.85 },
              sending && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.chatQuickText}>{q.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.chatInputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Votre question..."
          placeholderTextColor={colors.textHint}
          style={styles.chatInput}
          editable={!sending}
          onSubmitEditing={() => send()}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => send()}
          disabled={sending || !input.trim()}
          style={({ pressed }) => [
            styles.chatSendBtn,
            (sending || !input.trim()) && { opacity: 0.5 },
            pressed && !sending && input.trim() && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.chatSendText}>Envoyer</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StarPicker({ value, onChange, size = 32, styles, disabled }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={disabled}
          // Cliquer sur l'étoile déjà sélectionnée la désélectionne (passe à 0)
          onPress={() => onChange(value === n ? 0 : n)}
          hitSlop={6}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.star, { fontSize: size }]}>
            {n <= value ? '⭐' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function RoleBadge({ role, styles }) {
  if (!role || role === 'member') {
    return (
      <View style={[styles.roleBadge, styles.roleBadgeMember]}>
        <Text style={[styles.roleBadgeText, styles.roleBadgeTextMember]}>
          Membre
        </Text>
      </View>
    );
  }
  if (role === 'admin') {
    return (
      <View style={[styles.roleBadge, styles.roleBadgeAdmin]}>
        <Text style={styles.roleBadgeTextLight}>Admin</Text>
      </View>
    );
  }
  if (role === 'editor') {
    return (
      <View style={[styles.roleBadge, styles.roleBadgeEditor]}>
        <Text style={styles.roleBadgeTextLight}>Éditeur</Text>
      </View>
    );
  }
  return null;
}

function StarsReadonly({ value, styles }) {
  return (
    <Text style={styles.starsReadonly}>
      {[1, 2, 3, 4, 5].map((n) => (n <= value ? '⭐' : '☆')).join('')}
    </Text>
  );
}

function formatRatingDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function RatingsSection({ recipe, user, profile, styles, colors }) {
  const [myRating, setMyRating] = useState(null);
  const [othersRatings, setOthersRatings] = useState([]);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const { data: ratings } = await supabase
      .from('ratings')
      .select('id, user_id, rating, comment, created_at')
      .eq('recipe_id', recipe.id)
      .order('created_at', { ascending: false });
    const rawList = ratings || [];
    // Charge les profils en une requête séparée pour éviter les ambiguïtés
    // d'embedding PostgREST (la FK ratings.user_id → profiles.id n'est pas
    // toujours auto-détectée si profiles.id pointe lui-même vers auth.users).
    const userIds = Array.from(new Set(rawList.map((r) => r.user_id))).filter(Boolean);
    let profilesById = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, first_name, role')
        .in('id', userIds);
      for (const p of profs || []) profilesById[p.id] = p;
    }
    const list = rawList.map((r) => ({ ...r, profiles: profilesById[r.user_id] || null }));
    // eslint-disable-next-line no-console
    console.log('[ratings]', { rawList, profilesById, list });
    const mine = user ? list.find((r) => r.user_id === user.id) : null;
    setMyRating(mine || null);
    setOthersRatings(list.filter((r) => !mine || r.id !== mine.id));
    if (mine) {
      setStars(mine.rating);
      setComment(mine.comment || '');
      setEditing(false);
    } else {
      setStars(0);
      setComment('');
      setEditing(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (recipe?.id) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id, user?.id]);

  const onSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    let res;
    // Si l'utilisateur a déselectionné toutes les étoiles ET avait déjà une note,
    // on supprime sa note de la table.
    if (stars === 0) {
      if (myRating) {
        res = await supabase.from('ratings').delete().eq('id', myRating.id);
      } else {
        setSubmitting(false);
        return;
      }
    } else if (stars >= 1 && stars <= 5) {
      const payload = {
        user_id: user.id,
        recipe_id: recipe.id,
        rating: stars,
        comment: comment.trim() || null,
      };
      if (myRating) {
        res = await supabase
          .from('ratings')
          .update({ rating: payload.rating, comment: payload.comment })
          .eq('id', myRating.id);
      } else {
        res = await supabase.from('ratings').insert(payload);
      }
    } else {
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (res?.error) {
      if (Platform.OS === 'web') window.alert(`Envoi impossible\n\n${res.error.message}`);
      else Alert.alert('Envoi impossible', res.error.message);
      return;
    }
    await reload();
  };

  if (!user) {
    return (
      <View style={styles.ratingsSection}>
        <Text style={styles.ratingsTitle}>Noter cette recette</Text>
        <Text style={styles.ratingsHint}>
          Connectez-vous pour laisser une note.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.ratingsSection}>
      <Text style={styles.ratingsTitle}>Noter cette recette</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />
      ) : myRating && !editing ? (
        <View style={styles.myRatingCard}>
          <View style={styles.myRatingHeader}>
            <View style={styles.reviewNameStarsRow}>
              <Text style={styles.reviewName}>
                {myRating.profiles?.username ||
                  profile?.username ||
                  myRating.profiles?.first_name ||
                  profile?.first_name ||
                  'Vous'}
              </Text>
              <RoleBadge
                role={myRating.profiles?.role || profile?.role}
                styles={styles}
              />
              <StarsReadonly value={myRating.rating} styles={styles} />
            </View>
            <Pressable
              onPress={() => setEditing(true)}
              style={({ pressed }) => [
                styles.editRatingBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.editRatingText}>Modifier</Text>
            </Pressable>
          </View>
          {myRating.comment ? (
            <Text style={styles.myRatingComment}>{myRating.comment}</Text>
          ) : null}
        </View>
      ) : (
        <>
          <StarPicker
            value={stars}
            onChange={setStars}
            styles={styles}
            disabled={submitting}
          />
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Votre avis (optionnel)..."
            placeholderTextColor={colors.textHint}
            style={styles.commentInput}
            multiline
            numberOfLines={3}
            maxLength={500}
            editable={!submitting}
          />
          <Pressable
            onPress={onSubmit}
            disabled={submitting || (stars < 1 && !myRating)}
            style={({ pressed }) => [
              styles.sendRatingBtn,
              stars === 0 && myRating && { backgroundColor: colors.danger },
              (submitting || (stars < 1 && !myRating)) && { opacity: 0.5 },
              pressed && !submitting && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.sendRatingText}>
              {submitting
                ? 'Envoi...'
                : stars === 0 && myRating
                ? 'Retirer ma note'
                : 'Envoyer'}
            </Text>
          </Pressable>
        </>
      )}

      {othersRatings.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.ratingsListTitle}>
            Avis ({othersRatings.length})
          </Text>
          {othersRatings.map((r) => {
            const name =
              r.profiles?.username ||
              r.profiles?.first_name ||
              'Utilisateur';
            return (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewNameStarsRow}>
                    <Text style={styles.reviewName}>{name}</Text>
                    <RoleBadge role={r.profiles?.role} styles={styles} />
                    <StarsReadonly value={r.rating} styles={styles} />
                  </View>
                  <Text style={styles.reviewDate}>
                    {formatRatingDate(r.created_at)}
                  </Text>
                </View>
                {r.comment ? (
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function HeaderActions({ onEdit, onDelete, busy, styles, colors }) {
  return (
    <View style={styles.headerActions}>
      <Pressable
        onPress={onEdit}
        disabled={busy}
        style={({ pressed }) => [
          styles.iconBtn,
          { backgroundColor: colors.primaryLight },
          pressed && styles.iconBtnPressed,
          busy && { opacity: 0.5 },
        ]}
        accessibilityLabel="Modifier la recette"
        hitSlop={6}
      >
        <Text style={[styles.iconText, { color: colors.primary }]}>✎</Text>
      </Pressable>
      <Pressable
        onPress={onDelete}
        disabled={busy}
        style={({ pressed }) => [
          styles.iconBtn,
          { backgroundColor: colors.dangerLight },
          pressed && styles.iconBtnPressed,
          busy && { opacity: 0.5 },
        ]}
        accessibilityLabel="Supprimer la recette"
        hitSlop={6}
      >
        <Text style={[styles.iconText, { color: colors.danger }]}>🗑</Text>
      </Pressable>
    </View>
  );
}

export default function RecipeDetailScreen({ route, navigation }) {
  const { user, profile } = useAuth();
  const { colors, typography } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [recipe, setRecipe] = useState(route.params?.recipe ?? null);
  const [deleting, setDeleting] = useState(false);

  // Macronutriments
  const [macros, setMacros] = useState(null);
  const [macrosLoading, setMacrosLoading] = useState(false);

  const onComputeMacros = async () => {
    setMacrosLoading(true);
    setMacros(null);
    try {
      const res = await calculateRecipeMacros(recipe);
      setMacros(res);
    } catch (err) {
      notify('Calcul impossible', err.message || 'Erreur');
    } finally {
      setMacrosLoading(false);
    }
  };

  // Adapter les portions
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [newServings, setNewServings] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjusted, setAdjusted] = useState(null);
  const [savingAdj, setSavingAdj] = useState(false);

  const isOwner = !!user && recipe?.user_id === user.id;
  // Une recette du catalogue (featured) ne doit JAMAIS être éditable depuis
  // l'écran de détail public — passer par AdminEditFeatured pour l'admin.
  const isFeatured =
    recipe?.featured === true ||
    recipe?.featured === 'true' ||
    recipe?.featured === 't';
  const canManage = isOwner && !isFeatured;

  // Met à jour la recette locale si on revient depuis Edit avec une version modifiée
  useEffect(() => {
    if (route.params?.recipe) setRecipe(route.params.recipe);
  }, [route.params?.recipe]);

  // Réinitialise l'historique du chat assistant quand on quitte cette recette
  useEffect(() => {
    const id = recipe?.id;
    return () => {
      if (id) clearChatHistory(id);
    };
  }, [recipe?.id]);

  const onDelete = async () => {
    if (!recipe) return;
    const ok = await confirmDialog(
      'Supprimer cette recette ?',
      'Cette action est définitive.'
    );
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipe.id);
    setDeleting(false);
    if (error) return notify('Suppression impossible', error.message);
    navigation.goBack();
  };

  const onEdit = () => {
    navigation.navigate('EditRecipe', { recipe });
  };

  const runAdjust = async (s) => {
    setAdjusting(true);
    setAdjusted(null);
    try {
      const result = await adjustRecipeServings({
        recipe,
        newServings: parseInt(s, 10),
      });
      setAdjusted(result);
    } catch (err) {
      notify('Adaptation impossible', err.message || 'Erreur');
    } finally {
      setAdjusting(false);
    }
  };

  const saveAsNewRecipe = async () => {
    if (!adjusted || !user) return;
    setSavingAdj(true);
    const cleanTitle = stripServings(adjusted.title || recipe.title);
    const n = parseInt(newServings, 10);
    const { error } = await supabase.from('recipes').insert({
      user_id: user.id,
      title: `${cleanTitle} (${n} pers.)`,
      description: adjusted.description || null,
      ingredients: adjusted.ingredients || null,
      steps: adjusted.steps || null,
      servings: n,
      duration: adjusted.duration || null,
      cooking_temp: adjusted.cooking_temp || null,
      cooking_type: adjusted.cooking_type || null,
      fat_type: adjusted.fat_type || null,
      generated_by_ai: true,
    });
    setSavingAdj(false);
    if (error) return notify('Enregistrement impossible', error.message);
    notify('Enregistrée !', 'Nouvelle recette créée.');
    setAdjusted(null);
    setAdjustOpen(false);
  };

  const replaceCurrent = async () => {
    if (!adjusted || !recipe) return;
    setSavingAdj(true);
    const updates = {
      ingredients: adjusted.ingredients || null,
      servings: parseInt(newServings, 10),
    };
    const { data, error } = await supabase
      .from('recipes')
      .update(updates)
      .eq('id', recipe.id)
      .select('*')
      .single();
    setSavingAdj(false);
    if (error) return notify('Modification impossible', error.message);
    setRecipe(data);
    setAdjusted(null);
    setAdjustOpen(false);
    notify('Mise à jour', 'Quantités mises à jour.');
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        canManage ? (
          <HeaderActions
            onEdit={onEdit}
            onDelete={onDelete}
            busy={deleting}
            styles={styles}
            colors={colors}
          />
        ) : null,
    });
  }, [navigation, canManage, deleting, recipe?.id, recipe?.featured, styles, colors]);

  if (!recipe) {
    return (
      <Screen>
        <Text style={typography.body}>Recette introuvable.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.heroEmojiWrap}>
        <RecipeEmoji recipe={recipe} size={48} />
      </View>
      <Text style={styles.heroTitle}>{recipe.title}</Text>
      {recipe.description ? (
        <Text style={styles.description}>{recipe.description}</Text>
      ) : null}

      <View style={styles.pills}>
        <InfoPill
          label="Durée"
          value={recipe.duration ? formatDuration(recipe.duration) : null}
          styles={styles}
        />
        <InfoPill
          label="Personnes"
          value={recipe.servings ? `${recipe.servings}` : null}
          styles={styles}
        />
        <InfoPill
          label="Température"
          value={recipe.cooking_temp ? `${recipe.cooking_temp}°C` : null}
          styles={styles}
        />
        <InfoPill label="Cuisson" value={recipe.cooking_type} styles={styles} />
        <InfoPill label="Matière grasse" value={recipe.fat_type} styles={styles} />
        <InfoPill
          label="Cuisine"
          value={
            recipe.cuisine
              ? `${getCountryFlag(recipe.cuisine)} ${recipe.cuisine}`
              : null
          }
          styles={styles}
        />
      </View>

      {recipe.ingredients ? (
        <Section title="Ingrédients" styles={styles}>
          <IngredientsList ingredients={recipe.ingredients} />
        </Section>
      ) : null}

      {recipe.ingredients ? (
        <View style={styles.macrosWrap}>
          <Pressable
            onPress={onComputeMacros}
            disabled={macrosLoading}
            style={({ pressed }) => [
              styles.macrosBtn,
              pressed && { opacity: 0.85 },
              macrosLoading && { opacity: 0.6 },
            ]}
          >
            {macrosLoading ? (
              <View style={styles.macrosBtnInner}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.macrosBtnText}>Calcul en cours...</Text>
              </View>
            ) : (
              <Text style={styles.macrosBtnText}>
                📊 Voir les macronutriments
              </Text>
            )}
          </Pressable>

          {macros && !macrosLoading ? (
            <FadeInView>
              <View style={styles.macrosCard}>
                <Text style={styles.macrosTitle}>Macronutriments</Text>
                <Text style={styles.macrosSubtitle}>
                  Par portion (pour {macros.portions || recipe.servings || 1} pers.)
                </Text>
                <View style={styles.macrosGrid}>
                  <View style={[styles.macroBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.macroBadgeValue, { color: colors.primary }]}>
                      🔥 {Math.round(macros?.par_portion?.calories ?? 0)} kcal
                    </Text>
                    <Text style={styles.macroBadgeLabel}>Calories</Text>
                  </View>
                  <View style={[styles.macroBadge, { backgroundColor: colors.successLight }]}>
                    <Text style={[styles.macroBadgeValue, { color: colors.success }]}>
                      🥩 {Math.round(macros?.par_portion?.proteines ?? 0)} g
                    </Text>
                    <Text style={styles.macroBadgeLabel}>Protéines</Text>
                  </View>
                  <View style={[styles.macroBadge, { backgroundColor: colors.warningLight }]}>
                    <Text style={[styles.macroBadgeValue, { color: colors.warning }]}>
                      🍞 {Math.round(macros?.par_portion?.glucides ?? 0)} g
                    </Text>
                    <Text style={styles.macroBadgeLabel}>Glucides</Text>
                  </View>
                  <View style={[styles.macroBadge, { backgroundColor: colors.dangerLight }]}>
                    <Text style={[styles.macroBadgeValue, { color: colors.dangerText }]}>
                      🧈 {Math.round(macros?.par_portion?.lipides ?? 0)} g
                    </Text>
                    <Text style={styles.macroBadgeLabel}>Lipides</Text>
                  </View>
                </View>
                <Text style={styles.macrosTotal}>
                  Total recette : {Math.round(macros?.total?.calories ?? 0)} kcal
                </Text>
                <Pressable
                  onPress={() => setMacros(null)}
                  style={({ pressed }) => [
                    styles.macrosClose,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.macrosCloseText}>Fermer</Text>
                </Pressable>
              </View>
            </FadeInView>
          ) : null}
        </View>
      ) : null}

      {recipe.steps ? (
        <Section title="Étapes" styles={styles}>
          <StepsList steps={recipe.steps} />
        </Section>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        {!adjustOpen ? (
          <Button
            title="Adapter les portions"
            onPress={() => {
              setAdjustOpen(true);
              setNewServings(
                recipe.servings ? String(recipe.servings) : '2'
              );
            }}
          />
        ) : (
          <View style={styles.adjustBox}>
            <Text style={styles.adjustTitle}>Adapter pour combien ?</Text>
            <ServingsSelector
              value={newServings}
              onChange={setNewServings}
              disabled={adjusting || savingAdj}
            />
            <Button
              title={adjusting ? 'Recalcul...' : 'Recalculer avec l\'IA'}
              onPress={() => runAdjust(newServings)}
              loading={adjusting}
              disabled={savingAdj}
            />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Annuler"
              variant="ghost"
              onPress={() => {
                setAdjustOpen(false);
                setAdjusted(null);
              }}
              disabled={adjusting || savingAdj}
            />

            {adjusting && (
              <View style={{ alignItems: 'center', marginTop: spacing.md }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {adjusted && (
              <>
                <RecipePreview
                  recipe={{
                    ...adjusted,
                    title: `${stripServings(adjusted.title || recipe.title)} (${newServings} pers.)`,
                    servings: parseInt(newServings, 10),
                  }}
                />
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    title="Sauvegarder comme nouvelle recette"
                    onPress={saveAsNewRecipe}
                    loading={savingAdj}
                  />
                  <View style={{ height: spacing.sm }} />
                  <Button
                    title="Remplacer la recette actuelle"
                    variant="ghost"
                    onPress={replaceCurrent}
                    disabled={savingAdj || !isOwner}
                  />
                  {!isOwner && (
                    <Text
                      style={[
                        typography.small,
                        { textAlign: 'center', marginTop: spacing.xs },
                      ]}
                    >
                      Seul le propriétaire peut remplacer la recette.
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>
        )}
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Pressable
          onPress={() =>
            navigation.navigate('ChefAssistant', { recipe })
          }
          style={({ pressed }) => [
            styles.assistantOpenBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.assistantOpenText}>
            👨‍🍳 Assistant Cuisinier
          </Text>
          <Text style={styles.assistantOpenHint}>
            Notre assistant vous guide pas à pas sur cette recette
          </Text>
        </Pressable>
      </View>

      <RatingsSection
        recipe={recipe}
        user={user}
        profile={profile}
        styles={styles}
        colors={colors}
      />
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  heroEmojiWrap: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  description: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
    justifyContent: 'center',
  },
  pill: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 96,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    lineHeight: 14,
  },
  pillValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  section: { marginTop: spacing.xl },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
  iconText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  adjustBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  adjustTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  macrosWrap: { marginTop: spacing.lg },
  macrosBtn: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macrosBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macrosBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  macrosCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
  },
  macrosTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  macrosSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  macrosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  macroBadge: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroBadgeValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  macroBadgeLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  macrosTotal: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  macrosClose: {
    marginTop: spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  macrosCloseText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },

  assistantOpenBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantOpenText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  assistantOpenHint: {
    color: '#FFFFFF',
    opacity: 0.85,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  chatCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 20,
    flexDirection: 'column',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  chatHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chatCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  chatCloseText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  chatMessages: {
    flex: 1,
    minHeight: 0,
  },
  chatMessagesContent: {
    padding: 12,
    gap: 8,
  },
  chatEmpty: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    padding: 12,
  },
  bubbleAssistant: { backgroundColor: colors.background },
  bubbleUser: { backgroundColor: colors.primary },
  bubbleTextAssistant: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  bubbleTextUser: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 18,
    fontWeight: '600',
  },
  chatQuickScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  chatQuickContent: {
    gap: 6,
    padding: 8,
  },
  chatQuickBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
  },
  chatQuickText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    alignItems: 'stretch',
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    backgroundColor: colors.background,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  chatSendBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  ratingsSection: { marginTop: spacing.xl },
  ratingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  ratingsHint: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: spacing.sm,
  },
  star: {
    color: colors.warning,
  },
  starsReadonly: {
    fontSize: 16,
    color: colors.warning,
    letterSpacing: 1,
  },
  commentInput: {
    minHeight: 70,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  sendRatingBtn: {
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendRatingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  myRatingCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
  },
  myRatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editRatingBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
  },
  editRatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  myRatingComment: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  ratingsListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reviewNameStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  reviewName: { fontSize: 14, fontWeight: '700', color: colors.text },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleBadgeAdmin: { backgroundColor: '#FF6B35' },
  roleBadgeEditor: { backgroundColor: '#3498DB' },
  roleBadgeMember: { backgroundColor: colors.border },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  roleBadgeTextLight: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  roleBadgeTextMember: { color: colors.textSecondary },
  reviewDate: { fontSize: 11, color: colors.textSecondary },
  reviewComment: {
    marginTop: 4,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
});
