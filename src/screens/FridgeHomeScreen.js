import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import AnimatedFridge from '../components/AnimatedFridge';
import ScanChoiceModal from '../components/ScanChoiceModal';
import AIQuotaBadge from '../components/AIQuotaBadge';
import ExpirationAlertBanner from '../components/ExpirationAlertBanner';
import { spacing } from '../theme/theme';

export default function FridgeHomeScreen({ navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [itemCount, setItemCount] = useState(0);
  const [itemsWithDate, setItemsWithDate] = useState([]);
  const [scanModalOpen, setScanModalOpen] = useState(false);

  const loadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('fridge_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    setItemCount(count ?? 0);
  }, [user]);

  const loadItemsWithDate = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('fridge_items')
      .select('id, expiration_date, shelf_life_days')
      .eq('user_id', user.id)
      .not('expiration_date', 'is', null);
    setItemsWithDate(data ?? []);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadCount();
      loadItemsWithDate();
    }, [loadCount, loadItemsWithDate])
  );

  const statusText = (() => {
    if (itemCount === 0) return 'Ton frigo est vide';
    if (itemCount < 6) return 'Peu de stock';
    if (itemCount < 16) return 'Bien garni 🔥';
    return 'Plein à craquer 🔥';
  })();

  const openFridge = () => {
    navigation.navigate('FridgeList');
  };

  const openScanChoice = () => setScanModalOpen(true);

  const handleScanTicket = () => {
    setScanModalOpen(false);
    navigation.navigate('ScanReceipt');
  };

  const handleScanFridge = () => {
    setScanModalOpen(false);
    navigation.navigate('ScanFridge');
  };

  const askAI = () => {
    if (itemCount === 0) {
      const msg = 'Ajoute des ingrédients avant de générer une recette !';
      if (Platform.OS === 'web') window.alert(`Frigo vide\n\n${msg}`);
      else Alert.alert('Frigo vide', msg);
      return;
    }
    navigation.navigate('RecipeGeneration');
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top']}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: spacing.md }}>
          <Text style={{ fontSize: 22, fontWeight: '500', color: colors.text }}>
            Mon Frigo
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.textSecondary,
              marginTop: 2,
            }}
          >
            {itemCount} ingrédient{itemCount > 1 ? 's' : ''} · {statusText}
          </Text>
          {user ? (
            <View style={{ marginTop: 6 }}>
              <AIQuotaBadge userId={user.id} usageType="user" compact />
            </View>
          ) : null}
        </View>

        <View style={{ paddingTop: 12 }}>
          <ExpirationAlertBanner
            items={itemsWithDate}
            onPress={() => navigation.navigate('FridgeList')}
          />
        </View>

        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <AnimatedFridge
            onPress={openFridge}
            itemCount={itemCount}
            emptyState={itemCount === 0}
            width={180}
          />
        </View>

        <View style={{ alignItems: 'center', paddingBottom: 8 }}>
          <Text
            style={{
              fontSize: 13,
              color: colors.textSecondary,
              fontStyle: 'italic',
            }}
          >
            Tape pour ouvrir
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 16,
            flexDirection: 'row',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <Pressable
            onPress={openScanChoice}
            style={({ pressed }) => [
              {
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 16,
                borderWidth: 0.5,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 26 }}>📸</Text>
            <View>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.text,
                  fontWeight: '500',
                }}
              >
                Scanner
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.textSecondary,
                  marginTop: 1,
                }}
              >
                Frigo ou ticket
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={openFridge}
            style={({ pressed }) => [
              {
                flex: 1,
                backgroundColor: colors.primary,
                borderRadius: 14,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 26 }}>✏️</Text>
            <View>
              <Text
                style={{
                  fontSize: 13,
                  color: '#FFFFFF',
                  fontWeight: '500',
                }}
              >
                Ajouter
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.85)',
                  marginTop: 1,
                }}
              >
                Manuellement
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Pressable
            onPress={askAI}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surfaceAlt,
                borderRadius: 14,
                padding: 14,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 0.5,
                borderColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 22 }}>🍳</Text>
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: colors.primary,
                  }}
                >
                  Que cuisiner avec ça ?
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.textSecondary,
                    marginTop: 1,
                  }}
                >
                  IA · {itemCount} ingrédient{itemCount > 1 ? 's' : ''} dispo
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 16, color: colors.primary }}>›</Text>
          </Pressable>
        </View>
      </View>

      <ScanChoiceModal
        visible={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onTicket={handleScanTicket}
        onFridge={handleScanFridge}
      />
    </SafeAreaView>
  );
}
