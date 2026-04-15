import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/theme';

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
  const [fridge, setFridge] = useState([]);
  const [loaded, setLoaded] = useState(false);

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

  const list = parseIngredients(ingredients);
  if (list.length === 0) return null;

  const showIndicators = !!user && loaded;

  return (
    <View style={styles.wrap}>
      {list.map((text, i) => {
        let dotStyle = null;
        if (showIndicators) {
          const match = matchFridge(text, fridge);
          const inFridge = match && Number(match.quantity) > 0;
          dotStyle = inFridge ? styles.dotGreen : styles.dotRed;
        }
        return (
          <View key={i} style={styles.chip}>
            <Text style={styles.text}>{text}</Text>
            {dotStyle ? <View style={[styles.dot, dotStyle]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.sm,
    width: '100%',
  },
  chip: {
    flexShrink: 1,
    maxWidth: '100%',
    backgroundColor: '#FFF8F0',
    borderColor: '#F0E8E0',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'relative',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
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
  dotRed: { backgroundColor: colors.error },
});
