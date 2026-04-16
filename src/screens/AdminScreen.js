import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import WebScroll from '../components/WebScroll';
import RecipeEmoji from '../components/RecipeEmoji';
import EmojiPicker from '../components/EmojiPicker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { generateRecipesBatch, classifyDishType } from '../lib/ai';
import { formatDateFr } from '../lib/dateFr';
import { formatDuration } from '../lib/formatDuration';
import { getCountryFlag } from '../lib/countryFlags';
import { useTheme } from '../contexts/ThemeContext';
import { maxContentWidth, spacing } from '../theme/theme';

const BASE_CUISINES = ['française', 'italienne', 'espagnole'];

function CuisineManageRow({ cuisine, styles, colors, onRename, onToggleVisible, onSchedule, onDelete }) {
  const [name, setName] = useState(cuisine.display_name || '');
  const [start, setStart] = useState(cuisine.schedule_start || '');
  const [end, setEnd] = useState(cuisine.schedule_end || '');
  useEffect(() => {
    setName(cuisine.display_name || '');
    setStart(cuisine.schedule_start || '');
    setEnd(cuisine.schedule_end || '');
  }, [cuisine.id, cuisine.display_name, cuisine.schedule_start, cuisine.schedule_end]);

  const nameChanged = name.trim() && name.trim() !== (cuisine.display_name || '');
  const dateChanged =
    (start || '') !== (cuisine.schedule_start || '') ||
    (end || '') !== (cuisine.schedule_end || '');

  return (
    <View style={styles.manageRow}>
      <View style={styles.manageRowHeader}>
        <Text style={styles.manageFlag}>{cuisine.flag || '🏳️'}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.manageNameInput}
          placeholder="Nom affiché"
          placeholderTextColor={colors.textHint}
        />
        <Pressable
          onPress={() => onRename(cuisine, name)}
          disabled={!nameChanged}
          style={({ pressed }) => [
            styles.manageActionBtn,
            !nameChanged && { opacity: 0.4 },
            pressed && nameChanged && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.manageActionText}>✏️</Text>
        </Pressable>
      </View>

      <View style={styles.manageRowHeader}>
        <Pressable
          onPress={() => onToggleVisible(cuisine)}
          style={({ pressed }) => [
            styles.manageActionBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.manageActionText}>
            {cuisine.visible ? '👁️ Masquer' : '👁️ Afficher'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(cuisine)}
          style={({ pressed }) => [
            styles.manageActionBtn,
            { backgroundColor: colors.dangerLight },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={[styles.manageActionText, { color: colors.dangerText }]}>
            🗑️ Supprimer
          </Text>
        </Pressable>
      </View>

      <View style={styles.manageScheduleRow}>
        <Text style={styles.manageLabel}>📅 Début</Text>
        <TextInput
          value={start}
          onChangeText={setStart}
          style={styles.manageDateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textHint}
          autoCapitalize="none"
        />
        <Text style={styles.manageLabel}>Fin</Text>
        <TextInput
          value={end}
          onChangeText={setEnd}
          style={styles.manageDateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textHint}
          autoCapitalize="none"
        />
        <Pressable
          onPress={() => onSchedule(cuisine, start, end)}
          disabled={!dateChanged}
          style={({ pressed }) => [
            styles.manageActionBtn,
            !dateChanged && { opacity: 0.4 },
            pressed && dateChanged && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.manageActionText}>OK</Text>
        </Pressable>
      </View>
    </View>
  );
}

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function confirmDialog(title, message) {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export default function AdminScreen() {
  const { user, isAdmin, isEditor, loading: authLoading } = useAuth();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [recipes, setRecipes] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberRecipeCounts, setMemberRecipeCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCuisine, setSelectedCuisine] = useState('française');
  const [memberQuery, setMemberQuery] = useState('');
  const [activeTab, setActiveTab] = useState('recipes'); // 'recipes' | 'members' | 'suggestions'
  const [suggestions, setSuggestions] = useState([]);
  const [contactMessages, setContactMessages] = useState([]);
  const [expandedMsgId, setExpandedMsgId] = useState(null);
  const [pendingRegs, setPendingRegs] = useState([]);

  const approveRegistration = async (reg) => {
    const { error } = await supabase
      .from('profiles')
      .update({ approved: true })
      .eq('id', reg.id);
    if (error) return notify('Approbation impossible', error.message);
    setPendingRegs((prev) => prev.filter((r) => r.id !== reg.id));
    // Rafraîchir la liste des membres pour qu'il apparaisse
    await load();
  };

  const rejectRegistration = async (reg) => {
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(
          window.confirm(
            `Rejeter la demande de ${reg.username || reg.first_name || 'cet utilisateur'} ?`
          )
        )
      : new Promise((resolve) =>
          Alert.alert(
            'Rejeter la demande ?',
            '',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Rejeter', style: 'destructive', onPress: () => resolve(true) },
            ]
          )
        ));
    if (!ok) return;
    // Supprimer le profil (le compte Auth devra être supprimé manuellement par l'admin)
    const { error } = await supabase.from('profiles').delete().eq('id', reg.id);
    if (error) return notify('Rejet impossible', error.message);
    setPendingRegs((prev) => prev.filter((r) => r.id !== reg.id));
  };

  const deleteMember = async (member) => {
    const name = member.username || member.first_name || 'ce membre';
    // 1re confirmation
    const firstOk = await (Platform.OS === 'web'
      ? Promise.resolve(
          window.confirm(
            `Supprimer ${name} définitivement ?\n\nCette action est irréversible. Toutes ses recettes, notes et données seront supprimées.`
          )
        )
      : new Promise((resolve) =>
          Alert.alert(
            `Supprimer ${name} ?`,
            'Cette action est irréversible. Toutes ses recettes, notes et données seront supprimées.',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continuer', style: 'destructive', onPress: () => resolve(true) },
            ]
          )
        ));
    if (!firstOk) return;

    // 2e confirmation avec saisie
    let typed = null;
    if (Platform.OS === 'web') {
      typed = window.prompt(
        'Êtes-vous vraiment sûr ?\n\nTapez SUPPRIMER pour confirmer.'
      );
    } else {
      const secondOk = await new Promise((resolve) =>
        Alert.alert(
          'Êtes-vous vraiment sûr ?',
          'Cette action est définitive.',
          [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'SUPPRIMER', style: 'destructive', onPress: () => resolve(true) },
          ]
        )
      );
      typed = secondOk ? 'SUPPRIMER' : null;
    }
    if ((typed || '').trim().toUpperCase() !== 'SUPPRIMER') return;

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', member.id);
    if (error) return notify('Suppression impossible', error.message);
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    notify('Supprimé', `${name} a été supprimé.`);
  };

  const toggleBan = async (member) => {
    const next = !member.banned;
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(
          window.confirm(
            next
              ? `Bannir ${member.username || member.first_name} ? Il ne pourra plus accéder à l'app.`
              : `Débannir ${member.username || member.first_name} ?`
          )
        )
      : new Promise((resolve) =>
          Alert.alert(
            next ? 'Bannir ce membre ?' : 'Débannir ce membre ?',
            '',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'OK', style: next ? 'destructive' : 'default', onPress: () => resolve(true) },
            ]
          )
        ));
    if (!ok) return;
    const { error } = await supabase
      .from('profiles')
      .update({ banned: next })
      .eq('id', member.id);
    if (error) return notify('Action impossible', error.message);
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, banned: next } : m))
    );
  };

  // Compte des parrainages approuvés par éditeur/admin
  const sponsorshipCounts = useMemo(() => {
    const counts = {};
    for (const m of members) {
      if (m.approved && m.requested_editor_id) {
        counts[m.requested_editor_id] = (counts[m.requested_editor_id] || 0) + 1;
      }
    }
    return counts;
  }, [members]);

  const loadContactMessages = useCallback(async () => {
    if (!isAdmin) {
      setContactMessages([]);
      return;
    }
    const { data } = await supabase
      .from('contact_messages')
      .select('id, user_id, subject, message, read, created_at')
      .order('created_at', { ascending: false });
    const list = data || [];
    const ids = Array.from(new Set(list.map((m) => m.user_id))).filter(Boolean);
    let profMap = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, first_name')
        .in('id', ids);
      for (const p of profs || []) profMap[p.id] = p;
    }
    setContactMessages(
      list.map((m) => ({ ...m, profile: profMap[m.user_id] || null }))
    );
  }, [isAdmin]);

  const toggleMessage = async (msg) => {
    if (expandedMsgId === msg.id) {
      setExpandedMsgId(null);
      return;
    }
    setExpandedMsgId(msg.id);
    if (!msg.read) {
      await supabase
        .from('contact_messages')
        .update({ read: true })
        .eq('id', msg.id);
      setContactMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
      );
    }
  };

  const deleteMessage = async (msg) => {
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(window.confirm('Supprimer ce message ?'))
      : new Promise((resolve) =>
          Alert.alert('Supprimer ce message ?', '', [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
          ])
        ));
    if (!ok) return;
    const { error: delErr } = await supabase
      .from('contact_messages')
      .delete()
      .eq('id', msg.id);
    if (delErr) return notify('Suppression impossible', delErr.message);
    setContactMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };

  const unreadCount = useMemo(
    () => contactMessages.filter((m) => !m.read).length,
    [contactMessages]
  );
  const [emojiPickerFor, setEmojiPickerFor] = useState(null); // recipe object ou null
  const [cuisinesTable, setCuisinesTable] = useState([]);
  const [manageOpen, setManageOpen] = useState(false);

  const reloadCuisines = async () => {
    const { data } = await supabase
      .from('cuisines')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });
    setCuisinesTable(data || []);
  };

  const onRenameCuisine = async (cuisine, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from('cuisines')
      .update({ display_name: trimmed })
      .eq('id', cuisine.id);
    if (error) return notify('Renommage impossible', error.message);
    await reloadCuisines();
  };

  const onToggleVisible = async (cuisine) => {
    const { error } = await supabase
      .from('cuisines')
      .update({ visible: !cuisine.visible })
      .eq('id', cuisine.id);
    if (error) return notify('Mise à jour impossible', error.message);
    await reloadCuisines();
  };

  const onScheduleCuisine = async (cuisine, startIso, endIso) => {
    const { error } = await supabase
      .from('cuisines')
      .update({
        schedule_start: startIso || null,
        schedule_end: endIso || null,
      })
      .eq('id', cuisine.id);
    if (error) return notify('Planification impossible', error.message);
    await reloadCuisines();
  };

  const onDeleteCuisine = async (cuisine) => {
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(
          window.confirm(
            `Supprimer ${cuisine.display_name} ?\n\nToutes les recettes de ce pays seront aussi supprimées.`
          )
        )
      : new Promise((resolve) =>
          Alert.alert(
            `Supprimer ${cuisine.display_name} ?`,
            'Toutes les recettes de ce pays seront aussi supprimées.',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
            ]
          )
        ));
    if (!ok) return;
    await supabase
      .from('recipes')
      .delete()
      .eq('featured', true)
      .eq('cuisine', cuisine.name);
    await supabase.from('cuisines').delete().eq('id', cuisine.id);
    await reloadCuisines();
    await load();
  };

  const onSelectEmoji = async (emoji) => {
    if (!emojiPickerFor) return;
    const id = emojiPickerFor.id;
    const { error } = await supabase
      .from('recipes')
      .update({ custom_emoji: emoji })
      .eq('id', id);
    if (error) {
      notify('Mise à jour impossible', error.message);
      return;
    }
    setRecipes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, custom_emoji: emoji } : r))
    );
  };

  // Ajouter un pays
  const [adding, setAdding] = useState(false);
  const [newCuisine, setNewCuisine] = useState('');

  // Générer avec IA
  const [genOpen, setGenOpen] = useState(false);
  const [genCount, setGenCount] = useState('10');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });

  // Assignation des dish_type via IA
  const [assigning, setAssigning] = useState(false);
  const [assignProgress, setAssignProgress] = useState({ done: 0, total: 0, updated: 0 });

  const onAssignDishTypes = async () => {
    if (assigning) return;
    setAssigning(true);
    setAssignProgress({ done: 0, total: 0, updated: 0 });
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, ingredients')
        .eq('dish_type', 'tout');
      if (error) throw error;
      const list = data || [];
      setAssignProgress({ done: 0, total: list.length, updated: 0 });
      let updated = 0;
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        try {
          const dt = await classifyDishType({
            title: r.title,
            ingredients: r.ingredients,
          });
          if (dt) {
            const { error: upErr } = await supabase
              .from('recipes')
              .update({ dish_type: dt })
              .eq('id', r.id);
            if (!upErr) updated++;
          }
        } catch (err) {
          console.warn(`assign dish_type ${r.title}:`, err.message);
        }
        setAssignProgress({ done: i + 1, total: list.length, updated });
        await new Promise((res) => setTimeout(res, 500));
      }
      notify('Terminé', `${updated} recette${updated > 1 ? 's' : ''} mise${updated > 1 ? 's' : ''} à jour.`);
      await load();
    } catch (err) {
      notify('Erreur', err.message || 'Impossible de classifier les recettes.');
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isEditor) {
      navigation.navigate('MainTabs');
    }
  }, [authLoading, user, isEditor, navigation]);

  const load = useCallback(async () => {
    // Recettes featured : tous les éditeurs peuvent lire
    const { data: recipesData } = await supabase
      .from('recipes')
      .select('id, title, cuisine, duration, servings, featured, published, custom_emoji')
      .eq('featured', true)
      .order('title', { ascending: true });
    setRecipes(recipesData ?? []);

    const { data: cui } = await supabase
      .from('cuisines')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });
    setCuisinesTable(cui ?? []);

    // Membres + stats : uniquement l'admin
    if (isAdmin) {
      const [membersRes, userRecipesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, username, email, first_name, last_name, age, created_at, role, approved, banned, requested_editor_id'
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('recipes')
          .select('user_id')
          .or('featured.is.null,featured.eq.false'),
      ]);
      setMembers(
        (membersRes.data ?? []).filter((m) => m.role !== 'admin')
      );
      const counts = {};
      for (const r of userRecipesRes.data ?? []) {
        counts[r.user_id] = (counts[r.user_id] || 0) + 1;
      }
      setMemberRecipeCounts(counts);
    } else {
      setMembers([]);
      setMemberRecipeCounts({});
    }

    // Suggestions en attente : visibles par admin et éditeurs
    if (isEditor) {
      const { data: sugg } = await supabase
        .from('recipe_suggestions')
        .select('id, user_id, title, cuisine, description, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      const list = sugg || [];
      const ids = Array.from(new Set(list.map((s) => s.user_id))).filter(Boolean);
      let profMap = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, first_name')
          .in('id', ids);
        for (const p of profs || []) profMap[p.id] = p;
      }
      setSuggestions(list.map((s) => ({ ...s, profile: profMap[s.user_id] || null })));
    } else {
      setSuggestions([]);
    }

    if (isAdmin) {
      await loadContactMessages();
    } else {
      setContactMessages([]);
    }

    // Demandes d'inscription en attente
    if (isEditor) {
      let query = supabase
        .from('profiles')
        .select('id, username, first_name, last_name, email, age, created_at, requested_editor_id, approved, banned')
        .eq('approved', false);
      if (!isAdmin && user?.id) {
        query = query.eq('requested_editor_id', user.id);
      }
      const { data: pending } = await query
        .order('created_at', { ascending: false });
      setPendingRegs(pending || []);
    } else {
      setPendingRegs([]);
    }
  }, [isAdmin, isEditor, loadContactMessages, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!isEditor) return;
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [isEditor, load])
  );

  // Liste des cuisines existantes (unique) + les 3 bases
  const allCuisines = useMemo(() => {
    const set = new Set(BASE_CUISINES);
    for (const r of recipes) if (r.cuisine) set.add(r.cuisine);
    return Array.from(set);
  }, [recipes]);

  const countsByCuisine = useMemo(() => {
    const c = {};
    for (const r of recipes) {
      const k = r.cuisine || 'autre';
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [recipes]);

  const [recipeQuery, setRecipeQuery] = useState('');

  const recipesInCuisine = useMemo(() => {
    const base = recipes.filter((r) => r.cuisine === selectedCuisine);
    const q = recipeQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => (r.title || '').toLowerCase().includes(q));
  }, [recipes, selectedCuisine, recipeQuery]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const hay = `${m.first_name || ''} ${m.last_name || ''} ${m.username || ''} ${m.email || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [members, memberQuery]);

  const onChangeMemberRole = async (member, newRole) => {
    const action =
      newRole === 'editor' ? 'Promouvoir en éditeur' : 'Rétrograder en membre';
    const ok = await (Platform.OS === 'web'
      ? Promise.resolve(window.confirm(`${action} ?\n\n${member.first_name || member.username}`))
      : new Promise((resolve) => {
          Alert.alert(action, member.first_name || member.username, [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirmer', onPress: () => resolve(true) },
          ]);
        }));
    if (!ok) return;
    const prev = members;
    setMembers((p) =>
      p.map((x) => (x.id === member.id ? { ...x, role: newRole } : x))
    );
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', member.id);
    if (error) {
      setMembers(prev);
      notify('Mise à jour impossible', error.message);
    }
  };

  const onTogglePublished = async (recipe) => {
    const next = !recipe.published;
    // Optimistic
    setRecipes((p) =>
      p.map((x) => (x.id === recipe.id ? { ...x, published: next } : x))
    );
    const { error } = await supabase
      .from('recipes')
      .update({ published: next })
      .eq('id', recipe.id);
    if (error) {
      setRecipes((p) =>
        p.map((x) =>
          x.id === recipe.id ? { ...x, published: recipe.published } : x
        )
      );
      notify('Mise à jour impossible', error.message);
    }
  };

  const onDeleteRecipe = async (recipe) => {
    const ok = await confirmDialog(
      `Supprimer "${recipe.title}" ?`,
      'Cette action est définitive.'
    );
    if (!ok) return;
    const prev = recipes;
    setRecipes((p) => p.filter((r) => r.id !== recipe.id));
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipe.id);
    if (error) {
      setRecipes(prev);
      notify('Suppression impossible', error.message);
    }
  };

  const onAddCuisine = () => {
    const name = newCuisine.trim().toLowerCase();
    if (!name) return;
    setSelectedCuisine(name);
    setNewCuisine('');
    setAdding(false);
  };

  const runGenerate = async () => {
    const n = parseInt(genCount, 10);
    if (isNaN(n) || n < 1 || n > 50) {
      return notify('Oops', 'Choisissez entre 1 et 50 recettes.');
    }
    setGenerating(true);
    setGenProgress({ done: 0, total: n });
    try {
      // Récupère les titres existants pour cette cuisine (toutes featured, publiées ou non)
      const { data: existingRows } = await supabase
        .from('recipes')
        .select('title')
        .eq('featured', true)
        .eq('cuisine', selectedCuisine);
      const existingTitles = (existingRows ?? [])
        .map((r) => r.title)
        .filter(Boolean);

      const { recipes: generated, skipped: skippedFromPrompt } =
        await generateRecipesBatch({
          cuisine: selectedCuisine,
          count: n,
          existingTitles,
          onProgress: (done, total) => setGenProgress({ done, total }),
        });

      // Deuxième filtre de sécurité (au cas où Gemini renvoie quand même un doublon)
      const existingSet = new Set(
        existingTitles.map((t) => t.trim().toLowerCase())
      );
      const seen = new Set();
      const unique = [];
      let clientSkipped = 0;
      for (const r of generated) {
        const key = (r.title || '').trim().toLowerCase();
        if (!key) continue;
        if (existingSet.has(key) || seen.has(key)) {
          clientSkipped++;
          continue;
        }
        seen.add(key);
        unique.push(r);
      }

      const totalSkipped = skippedFromPrompt + clientSkipped;

      if (unique.length === 0) {
        notify(
          'Aucune nouvelle recette',
          totalSkipped > 0
            ? `${totalSkipped} recette${totalSkipped > 1 ? 's' : ''} ignorée${totalSkipped > 1 ? 's' : ''} (déjà existante${totalSkipped > 1 ? 's' : ''}).`
            : 'Réessayez plus tard.'
        );
        return;
      }

      const rows = unique.map((r) => ({
        user_id: user.id,
        title: r.title,
        description: r.description || null,
        ingredients: r.ingredients || null,
        steps: r.steps || null,
        servings: r.servings || 2,
        duration: r.duration || null,
        cooking_temp:
          r.cooking_temp && r.cooking_temp > 0 ? r.cooking_temp : null,
        cooking_type: r.cooking_type || null,
        fat_type: r.fat_type || null,
        dish_type: r.dish_type || 'tout',
        cuisine: selectedCuisine,
        featured: true,
        generated_by_ai: true,
      }));
      const { error } = await supabase.from('recipes').insert(rows);
      if (error) {
        notify('Insertion échouée', error.message);
        return;
      }
      const skippedMsg =
        totalSkipped > 0
          ? ` (${totalSkipped} ignorée${totalSkipped > 1 ? 's' : ''} car déjà existante${totalSkipped > 1 ? 's' : ''})`
          : '';
      notify(
        'Succès',
        `${rows.length} recette${rows.length > 1 ? 's' : ''} ajoutée${rows.length > 1 ? 's' : ''} au catalogue${skippedMsg}.`
      );
      setGenOpen(false);
      await load();
    } catch (err) {
      notify('Génération impossible', err.message || 'Erreur');
    } finally {
      setGenerating(false);
    }
  };

  if (!isEditor) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WebScroll
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
      >
        {/* TABS NAVIGATION */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={styles.tabsScroll}
        >
          <Pressable
            onPress={() => setActiveTab('recipes')}
            style={({ pressed }) => [
              styles.tabBtn,
              activeTab === 'recipes' && styles.tabBtnActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'recipes' && styles.tabBtnTextActive,
              ]}
              numberOfLines={1}
            >
              🍽️ Recettes ({recipes.length})
            </Text>
          </Pressable>
          {isAdmin && (
            <Pressable
              onPress={() => setActiveTab('members')}
              style={({ pressed }) => [
                styles.tabBtn,
                activeTab === 'members' && styles.tabBtnActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'members' && styles.tabBtnTextActive,
                ]}
                numberOfLines={1}
              >
                👥 Membres ({members.length})
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setActiveTab('suggestions')}
            style={({ pressed }) => [
              styles.tabBtn,
              activeTab === 'suggestions' && styles.tabBtnActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'suggestions' && styles.tabBtnTextActive,
              ]}
              numberOfLines={1}
            >
              💡 Suggestions ({suggestions.length})
            </Text>
          </Pressable>
          {isAdmin && (
            <Pressable
              onPress={() => setActiveTab('messages')}
              style={({ pressed }) => [
                styles.tabBtn,
                activeTab === 'messages' && styles.tabBtnActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'messages' && styles.tabBtnTextActive,
                ]}
                numberOfLines={1}
              >
                📩 Messages ({unreadCount})
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setActiveTab('registrations')}
            style={({ pressed }) => [
              styles.tabBtn,
              activeTab === 'registrations' && styles.tabBtnActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'registrations' && styles.tabBtnTextActive,
              ]}
              numberOfLines={1}
            >
              📋 Inscriptions ({pendingRegs.length})
            </Text>
          </Pressable>
        </ScrollView>

        {activeTab === 'recipes' && (
          <>
        {/* CUISINES CHIPS */}
        <Text style={styles.sectionTitle}>Recettes par pays</Text>

        {isAdmin && (
          <Pressable
            onPress={onAssignDishTypes}
            disabled={assigning}
            style={({ pressed }) => [
              styles.assignBtn,
              pressed && !assigning && { opacity: 0.85 },
              assigning && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.assignBtnText}>
              {assigning
                ? `${assignProgress.done}/${assignProgress.total} recettes traitées...`
                : '🔄 Assigner les types de plats'}
            </Text>
          </Pressable>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsScroll}
        >
          {allCuisines.map((c) => {
            const active = selectedCuisine === c;
            return (
              <Pressable
                key={c}
                onPress={() => setSelectedCuisine(c)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {getCountryFlag(c)} {c} ({countsByCuisine[c] || 0})
                </Text>
              </Pressable>
            );
          })}
          {adding ? (
            <View style={styles.addCuisineRow}>
              <TextInput
                value={newCuisine}
                onChangeText={setNewCuisine}
                placeholder="nom du pays"
                placeholderTextColor={colors.textHint}
                style={styles.addCuisineInput}
                autoFocus
                onSubmitEditing={onAddCuisine}
                maxLength={30}
              />
              <Pressable onPress={onAddCuisine} style={styles.addCuisineBtn}>
                <Text style={styles.addCuisineBtnText}>OK</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAdding(false);
                  setNewCuisine('');
                }}
                style={styles.addCuisineCancel}
              >
                <Text style={styles.addCuisineCancelText}>×</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setAdding(true)}
              style={({ pressed }) => [
                styles.chip,
                styles.addChip,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.chipText}>+ Ajouter un pays</Text>
            </Pressable>
          )}
        </ScrollView>

        {/* COUNTRY HEADER */}
        <View style={styles.countryHeader}>
          <Text style={styles.countryCount}>
            {getCountryFlag(selectedCuisine)} {recipesInCuisine.length} recette
            {recipesInCuisine.length > 1 ? 's' : ''} {selectedCuisine}
          </Text>
          <Pressable
            onPress={() =>
              navigation.navigate('AdminEditFeatured', {
                recipe: null,
                presetCuisine: selectedCuisine,
              })
            }
            style={({ pressed }) => [
              styles.smallBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.smallBtnText}>+ Ajouter</Text>
          </Pressable>
        </View>

        {/* GESTION DES PAYS */}
        <Pressable
          onPress={() => setManageOpen((v) => !v)}
          style={({ pressed }) => [
            styles.manageToggle,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.manageToggleText}>
            🌍 Gestion des pays {manageOpen ? '▴' : '▾'}
          </Text>
        </Pressable>
        {manageOpen ? (
          <View style={styles.manageList}>
            {cuisinesTable.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucun pays en base. Exécutez la migration cuisines.
              </Text>
            ) : (
              cuisinesTable.map((c) => (
                <CuisineManageRow
                  key={c.id}
                  cuisine={c}
                  styles={styles}
                  colors={colors}
                  onRename={onRenameCuisine}
                  onToggleVisible={onToggleVisible}
                  onSchedule={onScheduleCuisine}
                  onDelete={onDeleteCuisine}
                />
              ))
            )}
          </View>
        ) : null}

        {/* RECIPE SEARCH */}
        <View style={styles.recipeSearchWrap}>
          <Text style={styles.recipeSearchIcon}>🔍</Text>
          <TextInput
            value={recipeQuery}
            onChangeText={setRecipeQuery}
            placeholder="Rechercher une recette..."
            placeholderTextColor={colors.textHint}
            style={styles.recipeSearchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {recipeQuery.length > 0 && (
            <Pressable
              onPress={() => setRecipeQuery('')}
              hitSlop={8}
              style={styles.recipeSearchClear}
            >
              <Text style={styles.recipeSearchClearText}>×</Text>
            </Pressable>
          )}
        </View>

        {/* GENERATE AI */}
        {!genOpen ? (
          <Pressable
            onPress={() => setGenOpen(true)}
            style={({ pressed }) => [
              styles.generateBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.generateBtnText}>
              ✨ Générer des recettes avec l'IA
            </Text>
          </Pressable>
        ) : (
          <View style={styles.generateBox}>
            <Text style={styles.generateTitle}>
              Générer des recettes {selectedCuisine}
            </Text>
            <Text style={styles.genLabel}>Nombre de recettes</Text>
            <TextInput
              value={genCount}
              onChangeText={setGenCount}
              keyboardType="number-pad"
              maxLength={2}
              editable={!generating}
              style={styles.genInput}
              placeholder="10"
              placeholderTextColor={colors.textHint}
            />
            {generating && (
              <View style={styles.progress}>
                <Text style={styles.progressText}>
                  {genProgress.done} / {genProgress.total} générées...
                </Text>
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginTop: 8 }}
                />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={runGenerate}
                disabled={generating}
                style={({ pressed }) => [
                  styles.genSubmitBtn,
                  (generating) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.genSubmitText}>
                  {generating ? 'Génération...' : 'Générer'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setGenOpen(false)}
                disabled={generating}
                style={({ pressed }) => [
                  styles.genCancelBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.genCancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* RECIPES LIST */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : recipesInCuisine.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune recette pour ce pays.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {recipesInCuisine.map((r) => (
              <View key={r.id} style={styles.row}>
                <Pressable
                  onPress={() => setEmojiPickerFor(r)}
                  onLongPress={() => setEmojiPickerFor(r)}
                  accessibilityLabel="Changer l'emoji de la recette"
                  hitSlop={4}
                >
                  <RecipeEmoji recipe={r} size={26} />
                </Pressable>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {r.duration ? formatDuration(r.duration) : '—'}
                    {r.servings ? ` · ${r.servings} pers.` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onTogglePublished(r)}
                  style={({ pressed }) => [
                    styles.publishedBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel={
                    r.published ? 'Dépublier' : 'Publier'
                  }
                  hitSlop={6}
                >
                  <Text style={styles.publishedDot}>
                    {r.published ? '🟢' : '🔴'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    navigation.navigate('AdminEditFeatured', { recipe: r })
                  }
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { backgroundColor: colors.primaryLight },
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityLabel="Modifier"
                >
                  <Text style={[styles.iconBtnText, { color: colors.primary }]}>
                    ✎
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onDeleteRecipe(r)}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { backgroundColor: colors.dangerLight },
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityLabel="Supprimer"
                >
                  <Text style={[styles.iconBtnText, { color: colors.danger }]}>
                    ×
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
          </>
        )}

        {/* MEMBERS — onglet Membres, admin uniquement */}
        {activeTab === 'members' && isAdmin && (
          <>
            <Text style={styles.sectionTitle}>
              Membres ({members.length})
            </Text>

            {/* Stats parrainages */}
            {members.some((m) => m.role !== 'admin' && m.role !== 'editor') ? null : null}
            <View style={styles.sponsorGrid}>
              {members
                .filter((m) => m.role === 'admin' || m.role === 'editor')
                .map((ed) => (
                  <View key={ed.id} style={styles.sponsorCard}>
                    <Text style={styles.sponsorName}>
                      {ed.username || ed.first_name}
                    </Text>
                    <Text style={styles.sponsorRole}>
                      {ed.role === 'admin' ? 'Admin' : 'Éditeur'}
                    </Text>
                    <Text style={styles.sponsorCount}>
                      {sponsorshipCounts[ed.id] || 0}
                    </Text>
                    <Text style={styles.sponsorLabel}>parrainés</Text>
                  </View>
                ))}
            </View>

            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                value={memberQuery}
                onChangeText={setMemberQuery}
                placeholder="Rechercher un membre..."
                placeholderTextColor={colors.textHint}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {filteredMembers.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {memberQuery
                    ? 'Aucun membre trouvé.'
                    : 'Aucun membre inscrit.'}
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {filteredMembers.map((m) => {
                  const isMember = m.role === 'member';
                  const isEditorMember = m.role === 'editor';
                  return (
                    <View key={m.id} style={styles.memberCard}>
                      <View style={styles.memberHeader}>
                        <Text style={styles.memberName}>
                          {(m.first_name || '') + ' ' + (m.last_name || '')}
                        </Text>
                        <View
                          style={[
                            styles.roleBadge,
                            isEditorMember && styles.roleBadgeEditor,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeText,
                              isEditorMember && styles.roleBadgeTextEditor,
                            ]}
                          >
                            {isEditorMember ? 'Éditeur' : 'Membre'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.memberInfo}>
                        @{m.username || '—'} · {m.email || ''}
                      </Text>
                      <View style={styles.memberMetaRow}>
                        {m.age ? (
                          <Text style={styles.memberMeta}>{m.age} ans</Text>
                        ) : null}
                        <Text style={styles.memberMeta}>
                          Inscrit le {formatDateFr(m.created_at)}
                        </Text>
                      </View>
                      <Text style={styles.memberMeta}>
                        📖 {memberRecipeCounts[m.id] || 0} recette
                        {(memberRecipeCounts[m.id] || 0) > 1 ? 's' : ''}
                      </Text>

                      {isMember && (
                        <Pressable
                          onPress={() => onChangeMemberRole(m, 'editor')}
                          style={({ pressed }) => [
                            styles.roleBtn,
                            styles.roleBtnPromote,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.roleBtnPromoteText}>
                            ⬆️ Promouvoir Éditeur
                          </Text>
                        </Pressable>
                      )}
                      {isEditorMember && (
                        <Pressable
                          onPress={() => onChangeMemberRole(m, 'member')}
                          style={({ pressed }) => [
                            styles.roleBtn,
                            styles.roleBtnDemote,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.roleBtnDemoteText}>
                            ⬇️ Rétrograder Membre
                          </Text>
                        </Pressable>
                      )}

                      {isAdmin && m.role !== 'admin' && (
                        <View style={styles.dangerActionsRow}>
                          <Pressable
                            onPress={() => toggleBan(m)}
                            style={({ pressed }) => [
                              styles.banBtn,
                              m.banned && styles.unbanBtn,
                              pressed && { opacity: 0.85 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.banBtnText,
                                m.banned && styles.unbanBtnText,
                              ]}
                            >
                              {m.banned ? '✅ Débannir' : '🚫 Bannir'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => deleteMember(m)}
                            style={({ pressed }) => [
                              styles.deleteMemberBtn,
                              pressed && { opacity: 0.85 },
                            ]}
                          >
                            <Text style={styles.deleteMemberText}>
                              🗑️ Supprimer
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {activeTab === 'suggestions' && (
          <>
            <Text style={styles.sectionTitle}>
              Suggestions ({suggestions.length})
            </Text>
            {suggestions.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  Aucune suggestion en attente.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {suggestions.map((s) => {
                  const name =
                    s.profile?.username || s.profile?.first_name || 'Membre';
                  return (
                    <View key={s.id} style={styles.suggestionCard}>
                      <View style={styles.suggestionHeader}>
                        <Text style={styles.suggestionMember}>{name}</Text>
                        <Text style={styles.suggestionDate}>
                          {formatDateFr(new Date(s.created_at))}
                        </Text>
                      </View>
                      <Text style={styles.suggestionTitle}>
                        {s.title}{' '}
                        <Text style={styles.suggestionCuisine}>· {s.cuisine}</Text>
                      </Text>
                      {s.description ? (
                        <Text style={styles.suggestionDesc}>
                          {s.description}
                        </Text>
                      ) : null}
                      <View style={styles.suggestionActions}>
                        <Pressable
                          onPress={async () => {
                            await supabase
                              .from('recipe_suggestions')
                              .update({ status: 'approved' })
                              .eq('id', s.id);
                            setSuggestions((prev) =>
                              prev.filter((x) => x.id !== s.id)
                            );
                            navigation.navigate('AdminEditFeatured', {
                              recipe: null,
                              presetCuisine: s.cuisine,
                              presetTitle: s.title,
                              presetDescription: s.description || '',
                            });
                          }}
                          style={({ pressed }) => [
                            styles.suggestionApproveBtn,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.suggestionApproveText}>
                            ✅ Approuver
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={async () => {
                            const { error: delErr } = await supabase
                              .from('recipe_suggestions')
                              .delete()
                              .eq('id', s.id);
                            if (delErr) {
                              notify('Suppression impossible', delErr.message);
                              return;
                            }
                            setSuggestions((prev) =>
                              prev.filter((x) => x.id !== s.id)
                            );
                          }}
                          style={({ pressed }) => [
                            styles.suggestionRejectBtn,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.suggestionRejectText}>
                            ❌ Rejeter
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
        {activeTab === 'messages' && isAdmin && (
          <>
            <Text style={styles.sectionTitle}>
              Messages ({contactMessages.length})
            </Text>
            {contactMessages.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Aucun message.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {contactMessages.map((m) => {
                  const name =
                    m.profile?.username || m.profile?.first_name || 'Membre';
                  const expanded = expandedMsgId === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => toggleMessage(m)}
                      style={({ pressed }) => [
                        styles.messageCard,
                        !m.read && styles.messageCardUnread,
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <View style={styles.messageHeader}>
                        <Text style={styles.messageName}>{name}</Text>
                        <Text style={styles.messageDate}>
                          {formatDateFr(new Date(m.created_at))}
                        </Text>
                      </View>
                      <Text style={styles.messageSubject}>{m.subject}</Text>
                      <Text
                        style={styles.messageBody}
                        numberOfLines={expanded ? undefined : 2}
                      >
                        {m.message}
                      </Text>
                      {expanded ? (
                        <Pressable
                          onPress={() => deleteMessage(m)}
                          style={({ pressed }) => [
                            styles.messageDeleteBtn,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.messageDeleteText}>
                            🗑️ Supprimer
                          </Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {activeTab === 'registrations' && (
          <>
            <Text style={styles.sectionTitle}>
              Demandes ({pendingRegs.length})
            </Text>
            {pendingRegs.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Aucune demande en attente.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {pendingRegs.map((r) => (
                  <View key={r.id} style={styles.regCard}>
                    <Text style={styles.regName}>
                      {r.first_name} {r.last_name}
                      {r.username ? ` · @${r.username}` : ''}
                    </Text>
                    <Text style={styles.regMeta}>
                      {r.email}
                      {r.age ? ` · ${r.age} ans` : ''}
                    </Text>
                    <Text style={styles.regMeta}>
                      Demandé le {formatDateFr(new Date(r.created_at))}
                    </Text>
                    <View style={styles.regActions}>
                      <Pressable
                        onPress={() => approveRegistration(r)}
                        style={({ pressed }) => [
                          styles.regApproveBtn,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text style={styles.regApproveText}>✅ Approuver</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => rejectRegistration(r)}
                        style={({ pressed }) => [
                          styles.regRejectBtn,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text style={styles.regRejectText}>❌ Rejeter</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </WebScroll>

      <EmojiPicker
        visible={!!emojiPickerFor}
        onClose={() => setEmojiPickerFor(null)}
        onSelect={onSelectEmoji}
        current={emojiPickerFor?.custom_emoji}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    paddingBottom: 40,
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  assignBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  assignBtnText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  manageToggle: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  manageToggleText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  manageList: {
    gap: 10,
    marginBottom: 16,
  },
  manageRow: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  manageRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageFlag: { fontSize: 22 },
  manageNameInput: {
    flex: 1,
    minHeight: 36,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  manageActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
  },
  manageActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  manageScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  manageLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  manageDateInput: {
    minWidth: 110,
    minHeight: 36,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    color: colors.text,
    fontSize: 13,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  recipeSearchWrap: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  recipeSearchIcon: { fontSize: 16 },
  recipeSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  recipeSearchClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeSearchClearText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: -1,
  },
  suggestionCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  suggestionMember: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  suggestionDate: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  suggestionCuisine: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  suggestionDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  suggestionApproveBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionApproveText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  suggestionRejectBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionRejectText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '700',
  },
  messageCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  messageCardUnread: {
    borderColor: colors.primary,
    borderWidth: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageName: { fontSize: 13, fontWeight: '700', color: colors.text },
  messageDate: { fontSize: 11, color: colors.textSecondary },
  messageSubject: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  messageBody: {
    fontSize: 13,
    color: colors.text,
    marginTop: 6,
    lineHeight: 18,
  },
  messageDeleteBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.dangerLight,
  },
  messageDeleteText: {
    color: colors.dangerText,
    fontSize: 12,
    fontWeight: '700',
  },
  regCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  regName: { fontSize: 15, fontWeight: '700', color: colors.text },
  regMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  regActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  regApproveBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regApproveText: { color: colors.success, fontSize: 13, fontWeight: '700' },
  regRejectBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regRejectText: { color: colors.dangerText, fontSize: 13, fontWeight: '700' },
  dangerActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  banBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.dangerLight,
  },
  banBtnText: { color: colors.dangerText, fontSize: 12, fontWeight: '700' },
  unbanBtn: { backgroundColor: colors.successLight },
  unbanBtnText: { color: colors.success },
  deleteMemberBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
  },
  deleteMemberText: { color: '#C62828', fontSize: 12, fontWeight: '700' },
  sponsorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  sponsorCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  sponsorName: { fontSize: 13, fontWeight: '700', color: colors.text },
  sponsorRole: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  sponsorCount: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6,
  },
  sponsorLabel: { fontSize: 11, color: colors.textSecondary },

  tabsScroll: {
    marginHorizontal: -16,
    marginBottom: 20,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  tabBtn: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  tabBtnActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabBtnTextActive: { color: colors.primary },

  // Chips
  chipsScroll: { marginHorizontal: -16 },
  chipsContent: {
    gap: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  addChip: { borderStyle: 'dashed', borderColor: colors.primary },
  addCuisineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addCuisineInput: {
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    minWidth: 140,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  addCuisineBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCuisineBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  addCuisineCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCuisineCancelText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -2,
  },

  // Country header
  countryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  countryCount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  smallBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Generate AI
  generateBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 50,
  },
  generateBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  generateBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  generateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  genLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  genInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    maxWidth: 140,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  progress: {
    marginTop: 12,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
  },
  genSubmitBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  genCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genCancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },

  // Search
  searchWrap: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 12,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },

  // Recipe / member rows
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16, fontWeight: '700' },
  publishedBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishedDot: { fontSize: 14 },

  // Member card
  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  memberInfo: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  memberMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  memberMeta: { fontSize: 12, color: colors.textSecondary },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  roleBadgeEditor: { backgroundColor: colors.primaryLight },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  roleBadgeTextEditor: { color: colors.primary },
  roleBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBtnPromote: { backgroundColor: colors.primaryLight },
  roleBtnPromoteText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  roleBtnDemote: { backgroundColor: colors.dangerLight },
  roleBtnDemoteText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },

  empty: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyText: { fontSize: 14, color: colors.textSecondary },
});
