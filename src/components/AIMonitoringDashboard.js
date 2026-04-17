import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import {
  fetchAdminDashboardToday,
  fetchAdminTopUsers,
  fetchAdminLast7Days,
} from '../lib/aiQuota';
import { spacing } from '../theme/theme';

// Quota Google Gemini Free Tier : 1500 req/jour (à ajuster si plan payant)
const GOOGLE_DAILY_QUOTA = 1500;

const FRIENDLY_FUNCTION_NAMES = {
  generateRecipe: 'Studio IA (recette libre)',
  generateRecipeFromFridge: 'Frigo → Que cuisiner',
  generateWeeklyMenu: 'Menu hebdo',
  scanReceipt: 'Scan ticket',
  adjustRecipeServings: 'Ajuster portions',
  calculateRecipeMacros: 'Macros recette',
  analyzeNutritionBalance: 'Bilan nutri',
  generateRecipesBatch: 'Batch catalogue',
  classifyDishType: 'Classif dish_type',
  generateRecipeTitles: 'Titres IA',
};

function formatDay(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function SevenDaysBarChart({ data, colors }) {
  const today = new Date().toISOString().slice(0, 10);
  const max = Math.max(1, ...data.map((d) => d.total_count || 0));
  return (
    <View style={styles.chartWrap}>
      {data.map((d, idx) => {
        const isToday = (d.day || '').slice(0, 10) === today;
        const h = Math.max(4, Math.round(((d.total_count || 0) / max) * 100));
        return (
          <View key={idx} style={styles.chartCol}>
            <Text style={[styles.chartValue, { color: colors.textSecondary }]}>
              {d.total_count || 0}
            </Text>
            <View
              style={[
                styles.chartBar,
                {
                  height: h,
                  backgroundColor: isToday ? colors.primary : colors.border,
                },
              ]}
            />
            <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>
              {formatDay(d.day)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function AIMonitoringDashboard() {
  const { colors } = useTheme();
  const themed = useMemo(() => createThemedStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState({ total: 0, breakdown: [] });
  const [topUsers, setTopUsers] = useState([]);
  const [last7, setLast7] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [t, u, l7] = await Promise.all([
        fetchAdminDashboardToday(),
        fetchAdminTopUsers(10),
        fetchAdminLast7Days(),
      ]);
      setToday(t);
      setTopUsers(u);
      setLast7(l7);
    } catch (err) {
      setErrorMsg(err?.message || 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const remainingGoogle = Math.max(0, GOOGLE_DAILY_QUOTA - (today.total || 0));
  const googlePct = Math.min(
    100,
    Math.round(((today.total || 0) / GOOGLE_DAILY_QUOTA) * 100)
  );

  return (
    <View style={themed.container}>
      <View style={themed.headerRow}>
        <Text style={themed.sectionTitle}>🤖 Monitoring IA</Text>
        <Pressable
          onPress={load}
          disabled={loading}
          style={({ pressed }) => [
            themed.refreshBtn,
            pressed && { opacity: 0.7 },
            loading && { opacity: 0.5 },
          ]}
        >
          <Text style={[themed.refreshText, { color: colors.primary }]}>
            {loading ? '...' : '🔄 Actualiser'}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={themed.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : errorMsg ? (
        <Text style={[themed.errorText, { color: colors.textSecondary }]}>
          {errorMsg}
        </Text>
      ) : (
        <>
          {/* ZONE 1 : Vue d'ensemble */}
          <View style={themed.card}>
            <Text style={themed.cardTitle}>Aujourd'hui</Text>
            <Text style={[themed.bigNumber, { color: colors.primary }]}>
              {today.total}
            </Text>
            <Text style={[themed.smallHint, { color: colors.textSecondary }]}>
              requêtes IA totales
            </Text>

            <View style={themed.progressWrap}>
              <View
                style={[
                  themed.progressBar,
                  { backgroundColor: colors.border },
                ]}
              >
                <View
                  style={[
                    themed.progressFill,
                    {
                      width: `${googlePct}%`,
                      backgroundColor:
                        googlePct > 80 ? '#E74C3C' : colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={[themed.progressHint, { color: colors.textSecondary }]}>
                ~{remainingGoogle} requêtes restantes avant saturation Google
                ({GOOGLE_DAILY_QUOTA}/jour)
              </Text>
            </View>
          </View>

          {/* ZONE 2 : Breakdown par fonction */}
          <View style={themed.card}>
            <Text style={themed.cardTitle}>Par fonction</Text>
            {today.breakdown && today.breakdown.length > 0 ? (
              today.breakdown.map((b, idx) => (
                <View key={idx} style={themed.breakdownRow}>
                  <Text style={[themed.breakdownName, { color: colors.text }]}>
                    {FRIENDLY_FUNCTION_NAMES[b.function] || b.function}
                  </Text>
                  <Text style={[themed.breakdownCount, { color: colors.primary }]}>
                    {b.count}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[themed.emptyHint, { color: colors.textSecondary }]}>
                Aucun appel aujourd'hui.
              </Text>
            )}
          </View>

          {/* ZONE 3 : Top users */}
          <View style={themed.card}>
            <Text style={themed.cardTitle}>Top utilisateurs</Text>
            {topUsers.length > 0 ? (
              topUsers.map((u, idx) => (
                <View key={u.user_id || idx} style={themed.userRow}>
                  <Text style={[themed.userRank, { color: colors.textSecondary }]}>
                    {idx + 1}.
                  </Text>
                  <Text
                    style={[themed.userName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {u.username || 'Inconnu'}{' '}
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      ({u.role})
                    </Text>
                  </Text>
                  <Text style={[themed.userCount, { color: colors.primary }]}>
                    {u.call_count}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[themed.emptyHint, { color: colors.textSecondary }]}>
                Aucune activité aujourd'hui.
              </Text>
            )}
          </View>

          {/* ZONE 4 : Graphique 7 jours */}
          <View style={themed.card}>
            <Text style={themed.cardTitle}>7 derniers jours</Text>
            {last7.length > 0 ? (
              <SevenDaysBarChart data={last7} colors={colors} />
            ) : (
              <Text style={[themed.emptyHint, { color: colors.textSecondary }]}>
                Pas encore de données.
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    paddingTop: 10,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  chartBar: {
    width: '60%',
    borderRadius: 4,
    minHeight: 4,
  },
  chartValue: {
    fontSize: 10,
    fontWeight: '700',
  },
  chartLabel: {
    fontSize: 10,
    marginTop: 4,
  },
});

const createThemedStyles = (colors) =>
  StyleSheet.create({
    container: {
      gap: 10,
      marginTop: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    refreshBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    refreshText: {
      fontSize: 13,
      fontWeight: '700',
    },
    loadingWrap: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    errorText: {
      fontSize: 13,
      fontStyle: 'italic',
      paddingVertical: 10,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 0.5,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
    },
    bigNumber: {
      fontSize: 32,
      fontWeight: '800',
    },
    smallHint: {
      fontSize: 12,
      marginTop: 2,
    },
    progressWrap: {
      marginTop: 12,
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressHint: {
      fontSize: 11,
      marginTop: 6,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    breakdownName: {
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
    breakdownCount: {
      fontSize: 14,
      fontWeight: '700',
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      gap: 8,
    },
    userRank: {
      fontSize: 13,
      fontWeight: '700',
      width: 22,
    },
    userName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },
    userCount: {
      fontSize: 14,
      fontWeight: '700',
    },
    emptyHint: {
      fontSize: 12,
      fontStyle: 'italic',
      paddingVertical: 6,
    },
  });
