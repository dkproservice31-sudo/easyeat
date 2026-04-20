import React, { useEffect, useMemo, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { scanReceipt, scanFridge } from '../lib/ai';
import { AIQuotaExceededError } from '../lib/aiQuota';
import AIQuotaBadge from '../components/AIQuotaBadge';
import { compressImage } from '../lib/imageCompression';
import { getIngredientEmoji } from '../lib/ingredientEmoji';
import ExpirationBadge from '../components/ExpirationBadge';
import {
  computeExpirationDate,
  computeShelfLifeDays,
  getExpirationLabel,
} from '../lib/expirationStatus';
import { spacing, maxContentWidth } from '../theme/theme';

// Deux modes partagent 100% de la UI et du flow ; ne diffèrent que par
// les textes/emoji, les messages loading, la fonction IA appelée et le
// préfixe de logs console.
const MODES = {
  ticket: {
    headerTitle: 'Scanner un ticket',
    captureEmoji: '🧾',
    captureTitle: 'Prends en photo ton ticket',
    captureSubtitle:
      'Notre IA lit ton ticket et ajoute automatiquement les produits alimentaires à ton frigo. Les produits non-alimentaires sont ignorés.',
    captureTip: null,
    loadingMessages: [
      'Notre IA lit ton ticket...',
      'Détecte les produits alimentaires...',
      'Extrait les quantités...',
      'Presque fini...',
    ],
    reviewTitle: 'Produits détectés',
    reviewSubtitle: 'Coche ce que tu veux ajouter à ton frigo',
    emptyEmoji: '🤷',
    emptyTitle: 'Aucun produit détecté',
    emptySubtitle:
      'Réessaie avec une photo plus nette, ou ajoute manuellement.',
    successRetakeText: 'Scanner un autre ticket',
    logPrefix: '[ScanReceipt]',
    aiFunction: scanReceipt,
  },
  fridge: {
    headerTitle: 'Scanner mon frigo',
    captureEmoji: '🧊',
    captureTitle: 'Prends en photo ton frigo',
    captureSubtitle:
      "Prends en photo l'intérieur de ton frigo ouvert. Notre IA va identifier tes ingrédients et les ajouter automatiquement.",
    captureTip:
      '📸 Conseil : ouvre ton frigo, photographie le plus clairement possible. Les étiquettes lisibles aident l\'IA.',
    loadingMessages: [
      'Notre IA analyse ton frigo...',
      'Détecte les ingrédients visibles...',
      'Estime les quantités...',
      'Presque fini...',
    ],
    reviewTitle: 'Aliments détectés',
    reviewSubtitle: 'Coche ce que tu veux ajouter à ton frigo',
    emptyEmoji: '🤷',
    emptyTitle: 'Aucun aliment identifié',
    emptySubtitle:
      'Réessaie avec une photo plus nette, frigo bien éclairé.',
    successRetakeText: 'Scanner à nouveau',
    logPrefix: '[ScanFridge]',
    aiFunction: scanFridge,
  },
};

function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const UNITS = ['g', 'kg', 'ml', 'L', 'unité'];

// Normalise une valeur édité dans un TextInput de quantité en number|null.
// Utilisée à l'édition inline ET avant l'INSERT Supabase (double filet).
function normalizeQuantity(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    return isNaN(v) || v <= 0 ? null : v;
  }
  const s = String(v).trim();
  if (s === '') return null;
  const n = parseFloat(s.replace(',', '.'));
  if (isNaN(n) || n <= 0) return null;
  return n;
}

// Crée un <input type="file"> DOM éphémère, le .click(), renvoie le File.
// Sur web seulement — sur natif, onCancel est appelé immédiatement.
function pickImage({ capture, onFile, onCancel }) {
  if (typeof document === 'undefined') {
    if (onCancel) onCancel();
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (capture) input.setAttribute('capture', 'environment');
  input.style.display = 'none';
  document.body.appendChild(input);
  let settled = false;
  const cleanup = () => {
    if (document.body.contains(input)) document.body.removeChild(input);
  };
  input.onchange = () => {
    if (settled) return;
    settled = true;
    const file = input.files && input.files[0];
    cleanup();
    if (file) onFile(file);
    else if (onCancel) onCancel();
  };
  // Filet de sécurité : si l'user ferme le picker sans sélection et
  // qu'aucun onchange n'est déclenché, on nettoie après 60s.
  setTimeout(() => {
    if (!settled) {
      settled = true;
      cleanup();
      if (onCancel) onCancel();
    }
  }, 60000);
  input.click();
}

function ConfidenceBadge({ confidence }) {
  if (confidence !== 'low') return null;
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: 'rgba(255,165,0,0.2)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,165,0,0.5)',
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#D47A00' }}>
        ⚠ Incertain
      </Text>
    </View>
  );
}

function DateEditor({ item, onUpdate, colors }) {
  const todayISO = new Date().toISOString().split('T')[0];
  const label = getExpirationLabel(item);

  if (Platform.OS !== 'web') {
    // Sur natif, on affiche juste le label (lecture) — édition PWA-first
    return (
      <View style={[styles.dateChip, { borderColor: colors.border }]}>
        <Text style={[styles.dateChipText, { color: colors.textSecondary }]}>
          📅 {label || 'date non dispo sur mobile'}
        </Text>
      </View>
    );
  }

  const handleChange = (v) => {
    if (!v) {
      onUpdate({ expiration_date: null, shelf_life_days: null });
      return;
    }
    onUpdate({
      expiration_date: v,
      shelf_life_days: computeShelfLifeDays(v),
    });
  };

  return (
    <View style={styles.dateEditorWrap}>
      <Text style={[styles.dateChipText, { color: colors.textSecondary }]}>
        📅
      </Text>
      <input
        type="date"
        value={item.expiration_date || ''}
        onChange={(e) => handleChange(e.target.value || null)}
        min={todayISO}
        style={{
          padding: 6,
          borderRadius: 8,
          border: `0.5px solid ${colors.border}`,
          backgroundColor: 'transparent',
          color: colors.text,
          fontSize: 12,
          outline: 'none',
        }}
      />
      {label ? (
        <Text style={[styles.dateChipText, { color: colors.textSecondary }]}>
          ({label})
        </Text>
      ) : null}
    </View>
  );
}

function ReviewRow({ item, onUpdate, onDelete, colors }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onUpdate({ checked: !item.checked })}
        hitSlop={8}
        style={[
          styles.checkbox,
          {
            borderColor: item.checked ? colors.primary : colors.border,
            backgroundColor: item.checked ? colors.primary : 'transparent',
          },
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
      >
        {item.checked ? (
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>✓</Text>
        ) : null}
      </Pressable>

      <View style={styles.badgeWrap}>
        <ExpirationBadge item={item} compact />
      </View>

      <Text style={styles.rowEmoji}>{getIngredientEmoji(item.name)}</Text>

      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput
            value={item.name}
            onChangeText={(v) => onUpdate({ name: v })}
            placeholder="Nom"
            placeholderTextColor={colors.textHint}
            style={[
              styles.nameInput,
              { color: colors.text, borderColor: colors.border },
            ]}
            maxLength={60}
          />
          <ConfidenceBadge confidence={item.confidence} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput
            value={item.quantity == null ? '' : String(item.quantity)}
            onChangeText={(v) => {
              // Strict : toujours number|null dans le state
              const next = v.trim() === '' ? null : normalizeQuantity(v);
              onUpdate({ quantity: next, _quantityDraft: v });
            }}
            placeholder="Qté"
            placeholderTextColor={colors.textHint}
            keyboardType="decimal-pad"
            style={[
              styles.qtyInput,
              { color: colors.text, borderColor: colors.border },
            ]}
            maxLength={8}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {UNITS.map((u) => {
              const active = item.unit === u;
              return (
                <Pressable
                  key={u}
                  onPress={() => onUpdate({ unit: u })}
                  style={({ pressed }) => [
                    styles.unitChip,
                    {
                      backgroundColor: active ? colors.primary : 'transparent',
                      borderColor: active ? colors.primary : colors.border,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: active ? '#FFFFFF' : colors.textSecondary,
                    }}
                  >
                    {u}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <DateEditor item={item} onUpdate={onUpdate} colors={colors} />
      </View>

      <Pressable
        onPress={onDelete}
        hitSlop={8}
        style={({ pressed }) => [
          styles.deleteBtn,
          pressed && { opacity: 0.6 },
        ]}
        accessibilityLabel="Supprimer"
      >
        <Text style={{ fontSize: 18 }}>🗑</Text>
      </Pressable>
    </View>
  );
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScanScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const modeKey = route.params?.mode === 'fridge' ? 'fridge' : 'ticket';
  const mode = MODES[modeKey];

  const { user } = useAuth();
  const { colors } = useTheme();
  const themed = useMemo(() => createThemedStyles(colors), [colors]);

  // 'capture' | 'compressing' | 'loading' | 'review' | 'success' | 'error'
  const [status, setStatus] = useState('capture');
  const [items, setItems] = useState([]);
  const [addedCount, setAddedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [compressHint, setCompressHint] = useState('');
  const [saving, setSaving] = useState(false);

  // Rotation messages loading
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const it = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % mode.loadingMessages.length);
    }, 2000);
    return () => clearInterval(it);
  }, [status, mode.loadingMessages.length]);

  const handleFile = async (file) => {
    setStatus('compressing');
    setCompressHint('');
    setErrorMsg('');
    try {
      const { base64, sizeKB, originalSizeKB } = await compressImage(
        file,
        (msg) => setCompressHint(msg)
      );
      console.log(
        `${mode.logPrefix} Compressed: ${originalSizeKB} KB → ${sizeKB} KB`
      );
      setStatus('loading');
      setLoadingMsgIdx(0);
      const detected = await mode.aiFunction(base64, 'image/jpeg', user?.id);
      if (!Array.isArray(detected) || detected.length === 0) {
        setItems([]);
        setStatus('review');
        return;
      }
      const enriched = detected.map((it) => {
        const shelfLifeDays =
          typeof it.shelf_life_days === 'number' && it.shelf_life_days >= 0
            ? it.shelf_life_days
            : null;
        return {
          id: makeId(),
          name: it.name,
          quantity: normalizeQuantity(it.quantity),
          unit: it.unit || 'unité',
          confidence: it.confidence || 'medium',
          checked: it.confidence !== 'low',
          shelf_life_days: shelfLifeDays,
          expiration_date: computeExpirationDate(shelfLifeDays),
        };
      });
      setItems(enriched);
      setStatus('review');
    } catch (err) {
      if (err instanceof AIQuotaExceededError) {
        setErrorMsg(
          "Tu as atteint ta limite quotidienne de 20 générations IA. Reviens demain !"
        );
      } else {
        setErrorMsg(err?.message || 'Une erreur est survenue.');
      }
      setStatus('error');
    }
  };

  const launchCamera = () => {
    pickImage({
      capture: true,
      onFile: handleFile,
      onCancel: () => {},
    });
  };

  const launchGallery = () => {
    pickImage({
      capture: false,
      onFile: handleFile,
      onCancel: () => {},
    });
  };

  const updateItem = (id, patch) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
    );
  };

  const deleteItem = (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const addManualRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: makeId(),
        name: '',
        quantity: null,
        unit: 'unité',
        confidence: 'high',
        checked: true,
        shelf_life_days: null,
        expiration_date: null,
      },
    ]);
  };

  const checkedItems = items.filter((i) => i.checked && i.name.trim());

  const onAddToFridge = async () => {
    if (!user || checkedItems.length === 0) return;
    setSaving(true);
    const payloads = checkedItems.map((i) => {
      // Double filet : re-normalisation avant INSERT
      const qty = normalizeQuantity(i.quantity);
      const payload = {
        user_id: user.id,
        name: i.name.trim(),
        unit: i.unit || 'unité',
      };
      if (qty != null) payload.quantity = qty;
      if (i.expiration_date) payload.expiration_date = i.expiration_date;
      if (typeof i.shelf_life_days === 'number' && i.shelf_life_days >= 0) {
        payload.shelf_life_days = i.shelf_life_days;
      }
      return payload;
    });
    const { error } = await supabase.from('fridge_items').insert(payloads);
    setSaving(false);
    if (error) {
      notify('Ajout impossible', error.message);
      return;
    }
    setAddedCount(payloads.length);
    setStatus('success');
  };

  const retakePhoto = () => {
    setItems([]);
    setErrorMsg('');
    setCompressHint('');
    setStatus('capture');
  };

  return (
    <SafeAreaView style={themed.safe} edges={['top']}>
      <View style={themed.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            themed.backBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Retour"
          hitSlop={8}
        >
          <Text style={themed.backChevron}>‹</Text>
        </Pressable>
        <Text style={themed.headerTitle} numberOfLines={1}>
          {mode.headerTitle}
        </Text>
        <View style={{ minWidth: 36, alignItems: 'flex-end' }}>
          <AIQuotaBadge userId={user?.id} usageType="user" compact />
        </View>
      </View>

      {status === 'capture' ? (
        <View style={themed.centerContent}>
          <Text style={themed.bigEmoji}>{mode.captureEmoji}</Text>
          <Text style={themed.bigTitle}>{mode.captureTitle}</Text>
          <Text style={themed.bigSubtitle}>{mode.captureSubtitle}</Text>
          {mode.captureTip ? (
            <Text style={themed.tipText}>{mode.captureTip}</Text>
          ) : null}
          <Pressable
            onPress={launchCamera}
            style={({ pressed }) => [
              themed.primaryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={themed.primaryBtnText}>📸 Prendre une photo</Text>
          </Pressable>
          <Pressable
            onPress={launchGallery}
            style={({ pressed }) => [
              themed.secondaryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[themed.secondaryBtnText, { color: colors.primary }]}>
              🖼️ Choisir depuis la galerie
            </Text>
          </Pressable>
        </View>
      ) : status === 'compressing' || status === 'loading' ? (
        <View style={themed.centerContent}>
          <Text style={themed.bigEmoji}>✨</Text>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={themed.loadingText}>
            {status === 'compressing'
              ? compressHint || 'Préparation de ton image...'
              : mode.loadingMessages[loadingMsgIdx]}
          </Text>
        </View>
      ) : status === 'review' ? (
        items.length === 0 ? (
          <View style={themed.centerContent}>
            <Text style={themed.bigEmoji}>{mode.emptyEmoji}</Text>
            <Text style={themed.bigTitle}>{mode.emptyTitle}</Text>
            <Text style={themed.bigSubtitle}>{mode.emptySubtitle}</Text>
            <Pressable
              onPress={retakePhoto}
              style={({ pressed }) => [
                themed.primaryBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={themed.primaryBtnText}>📸 Reprendre</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setItems([
                  {
                    id: makeId(),
                    name: '',
                    quantity: null,
                    unit: 'unité',
                    confidence: 'high',
                    checked: true,
                    shelf_life_days: null,
                    expiration_date: null,
                  },
                ]);
              }}
              style={({ pressed }) => [
                themed.secondaryBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[themed.secondaryBtnText, { color: colors.primary }]}>
                + Ajouter manuellement
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={themed.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={themed.bigTitle}>{mode.reviewTitle}</Text>
              <Text style={themed.bigSubtitle}>{mode.reviewSubtitle}</Text>
              {items.map((it) => (
                <ReviewRow
                  key={it.id}
                  item={it}
                  onUpdate={(patch) => updateItem(it.id, patch)}
                  onDelete={() => deleteItem(it.id)}
                  colors={colors}
                />
              ))}
              <Pressable
                onPress={addManualRow}
                style={({ pressed }) => [
                  themed.addRowBtn,
                  { borderColor: colors.primary },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>
                  + Ajouter un produit manuellement
                </Text>
              </Pressable>
              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={themed.disclaimer}>
              <Text style={themed.disclaimerText}>
                ⓘ Les dates sont estimées par notre IA. Fie-toi à ton nez, tes yeux et ton goût avant de consommer.
              </Text>
            </View>

            <View style={themed.stickyActions}>
              <Pressable
                onPress={onAddToFridge}
                disabled={saving || checkedItems.length === 0}
                style={({ pressed }) => [
                  themed.saveBtn,
                  (saving || pressed) && { opacity: 0.85 },
                  checkedItems.length === 0 && { opacity: 0.4 },
                ]}
              >
                <Text style={themed.saveBtnText}>
                  {saving
                    ? 'Ajout en cours...'
                    : `💾 Ajouter au frigo (${checkedItems.length})`}
                </Text>
              </Pressable>
              <Pressable
                onPress={retakePhoto}
                disabled={saving}
                style={({ pressed }) => [
                  themed.regenBtn,
                  { borderColor: colors.primary },
                  pressed && { opacity: 0.85 },
                  saving && { opacity: 0.5 },
                ]}
              >
                <Text style={[themed.regenBtnText, { color: colors.primary }]}>
                  🔄 Reprendre une photo
                </Text>
              </Pressable>
            </View>
          </>
        )
      ) : status === 'success' ? (
        <View style={themed.centerContent}>
          <Text style={themed.bigEmoji}>✅</Text>
          <Text style={themed.bigTitle}>
            {addedCount} ingrédient{addedCount > 1 ? 's' : ''} ajouté{addedCount > 1 ? 's' : ''}
          </Text>
          <Text style={themed.bigSubtitle}>Ton frigo est à jour.</Text>
          <Pressable
            onPress={() => navigation.navigate('FridgeList')}
            style={({ pressed }) => [
              themed.primaryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={themed.primaryBtnText}>Voir mon frigo</Text>
          </Pressable>
          <Pressable
            onPress={retakePhoto}
            style={({ pressed }) => [
              themed.secondaryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[themed.secondaryBtnText, { color: colors.primary }]}>
              {mode.successRetakeText}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={themed.centerContent}>
          <Text style={themed.bigEmoji}>😕</Text>
          <Text style={themed.bigTitle}>Analyse impossible</Text>
          <Text style={themed.bigSubtitle}>{errorMsg}</Text>
          <Pressable
            onPress={retakePhoto}
            style={({ pressed }) => [
              themed.primaryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={themed.primaryBtnText}>Réessayer</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

// Styles non thémés (utilisés dans ReviewRow — colors passé en inline)
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  rowEmoji: {
    fontSize: 22,
    marginTop: 6,
    width: 26,
    textAlign: 'center',
  },
  nameInput: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  qtyInput: {
    width: 70,
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  unitChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 0.5,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    padding: 8,
    marginTop: 2,
  },
  badgeWrap: {
    width: 12,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dateEditorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  dateChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    alignSelf: 'flex-start',
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

const createThemedStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: spacing.sm,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backChevron: {
      fontSize: 24,
      lineHeight: 24,
      color: colors.text,
      marginTop: -2,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
      textAlign: 'center',
    },

    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 12,
    },
    bigEmoji: { fontSize: 54 },
    bigTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    bigSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 360,
    },
    tipText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      fontStyle: 'italic',
      lineHeight: 18,
      maxWidth: 340,
      opacity: 0.85,
    },
    loadingText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: spacing.sm,
    },

    primaryBtn: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 14,
      minHeight: 52,
      minWidth: 240,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 14,
      minHeight: 44,
      minWidth: 240,
      borderWidth: 0.5,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: {
      fontSize: 14,
      fontWeight: '700',
    },

    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 16,
      maxWidth: maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
    addRowBtn: {
      marginTop: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 0.5,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },

    disclaimer: {
      paddingHorizontal: 20,
      paddingBottom: 8,
      backgroundColor: colors.background,
    },
    disclaimerText: {
      fontSize: 11,
      fontStyle: 'italic',
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
    stickyActions: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 16,
      gap: 8,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    regenBtn: {
      borderRadius: 14,
      minHeight: 48,
      borderWidth: 0.5,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    regenBtnText: {
      fontSize: 14,
      fontWeight: '700',
    },
  });
