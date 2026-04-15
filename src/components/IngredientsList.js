import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { calculateIngredientMacros } from '../lib/ai';
import { spacing } from '../theme/theme';

function parseIngredients(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\n\r]+/)
    .map((s) => s.trim())
    .map((s) => s.replace(/^[-•·*]\s*/, '').trim())
    .filter(Boolean);
}

function matchFridge(ingredientText, fridgeItems) {
  const lc = ingredientText.toLowerCase();
  for (const it of fridgeItems) {
    const name = (it.name || '').toLowerCase().trim();
    if (!name) continue;
    if (lc.includes(name) || name.includes(lc)) return it;
  }
  return null;
}

export default function IngredientsList({ ingredients }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fridge, setFridge] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeMacros, setActiveMacros] = useState(null);
  const [activeError, setActiveError] = useState(null);
  const autoCloseRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setFridge([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('fridge_items')
        .select('name, quantity')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (!error) setFridge(data ?? []);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, []);

  const scheduleAutoClose = () => {
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    autoCloseRef.current = setTimeout(() => {
      setActiveIndex(null);
      setActiveMacros(null);
      setActiveError(null);
      setActiveLoading(false);
    }, 5000);
  };

  const onLongPressPill = async (index, text) => {
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    setActiveIndex(index);
    setActiveMacros(null);
    setActiveError(null);
    setActiveLoading(true);
    try {
      const res = await calculateIngredientMacros(text, '');
      setActiveMacros(res);
    } catch (err) {
      setActiveError(err?.message || 'Une erreur est survenue. Réessayez.');
    } finally {
      setActiveLoading(false);
      scheduleAutoClose();
    }
  };

  const list = parseIngredients(ingredients);
  if (list.length === 0) return null;

  const showIndicators = !!user && loaded;

  return (
    <View>
      <Text style={styles.hint}>Appui long = macros</Text>
      <View style={styles.wrap}>
        {list.map((text, i) => {
          let dotStyle = null;
          if (showIndicators) {
            const match = matchFridge(text, fridge);
            const inFridge = match && Number(match.quantity) > 0;
            dotStyle = inFridge ? styles.dotGreen : styles.dotRed;
          }
          const isActive = activeIndex === i;
          return (
            <View key={i} style={styles.pillCol}>
              <Pressable
                onLongPress={() => onLongPressPill(i, text)}
                delayLongPress={500}
                onPress={() => {
                  if (isActive) {
                    setActiveIndex(null);
                    setActiveMacros(null);
                  }
                }}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.text}>{text}</Text>
                {isActive && activeLoading ? (
                  <ActivityIndicator
                    color={colors.primary}
                    size="small"
                    style={styles.chipLoader}
                  />
                ) : null}
                {dotStyle ? <View style={[styles.dot, dotStyle]} /> : null}
              </Pressable>
              {isActive && activeMacros && !activeLoading ? (
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>
                    🔥 {Math.round(activeMacros.calories ?? 0)} kcal · 🥩{' '}
                    {Math.round(activeMacros.proteines ?? 0)} g · 🍞{' '}
                    {Math.round(activeMacros.glucides ?? 0)} g · 🧈{' '}
                    {Math.round(activeMacros.lipides ?? 0)} g
                  </Text>
                </View>
              ) : null}
              {isActive && activeError && !activeLoading ? (
                <View style={styles.bubble}>
                  <Text style={[styles.bubbleText, { color: colors.error }]}>
                    {activeError}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    hint: {
      fontSize: 11,
      color: colors.textTertiary,
      fontStyle: 'italic',
      marginBottom: spacing.sm,
    },
    wrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: spacing.sm,
      width: '100%',
    },
    pillCol: { alignItems: 'flex-start' },
    chip: {
      flexShrink: 1,
      maxWidth: '100%',
      backgroundColor: colors.ingredientBg,
      borderColor: colors.ingredientBorder,
      borderWidth: 1.5,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipLoader: { marginLeft: 4 },
    text: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    dot: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    dotGreen: { backgroundColor: colors.success },
    dotRed: { backgroundColor: colors.danger },
    bubble: {
      marginTop: 6,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    bubbleText: {
      fontSize: 12,
      color: colors.text,
      fontWeight: '600',
    },
  });
