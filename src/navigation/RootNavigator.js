import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import RecipesScreen from '../screens/RecipesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PlanningScreen from '../screens/PlanningScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import AddRecipeScreen from '../screens/AddRecipeScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import ChefAssistantScreen from '../screens/ChefAssistantScreen';
import HelpScreen from '../screens/HelpScreen';
import PendingApprovalScreen from '../screens/PendingApprovalScreen';
import BannedScreen from '../screens/BannedScreen';
import EditRecipeScreen from '../screens/EditRecipeScreen';
import FridgeHomeScreen from '../screens/FridgeHomeScreen';
import FridgeListScreen from '../screens/FridgeListScreen';
import RecipeGenerationScreen from '../screens/RecipeGenerationScreen';
import ScanScreen from '../screens/ScanScreen';
import ShoppingScreen from '../screens/ShoppingScreen';
import AIScreen from '../screens/AIScreen';
import WeeklyMenuScreen from '../screens/WeeklyMenuScreen';
import CookingModeScreen from '../screens/CookingModeScreen';
import AdminScreen from '../screens/AdminScreen';
import AdminEditFeaturedScreen from '../screens/AdminEditFeaturedScreen';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { radius, spacing } from '../theme/theme';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_ICONS = {
  Recettes: '📖',
  Frigo: '❄️',
  Courses: '🛒',
  Planning: '📅',
  IA: '✨',
};

const EMOJI_STYLE =
  Platform.OS === 'web'
    ? {
        fontFamily:
          '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif',
      }
    : null;

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const bottomPad = Math.max(insets.bottom, spacing.sm);
  // Sur web, on combine avec env(safe-area-inset-bottom) via style string
  const webSafeBottom =
    Platform.OS === 'web'
      ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }
      : { paddingBottom: bottomPad };
  return (
    <View style={[styles.tabBar, webSafeBottom]}>
      <View style={styles.tabBarInner}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              // Pour les tabs avec Stack imbriqué, forcer le retour à
              // l'initial route (sinon React Navigation préserve l'état
              // du stack — ex: après un navigate('Frigo', { screen:
              // 'FridgeList' }) via la cloche, on resterait bloqué sur
              // FridgeList au lieu de revenir au frigo SVG).
              if (route.name === 'Frigo') {
                navigation.navigate('Frigo', { screen: 'FridgeHome' });
              } else if (route.name === 'IA') {
                navigation.navigate('IA', { screen: 'AIHome' });
              } else {
                navigation.navigate(route.name);
              }
            }
          };

          const icon = TAB_ICONS[route.name] ?? '•';
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tab,
                pressed && styles.pillPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
            >
              <Text
                style={[
                  styles.icon,
                  EMOJI_STYLE,
                  { opacity: isFocused ? 1 : 0.55 },
                ]}
              >
                {icon}
              </Text>
              <Text
                style={[
                  styles.label,
                  isFocused ? styles.labelActive : styles.labelInactive,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FridgeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FridgeHome" component={FridgeHomeScreen} />
      <Stack.Screen name="FridgeList" component={FridgeListScreen} />
      <Stack.Screen
        name="RecipeGeneration"
        component={RecipeGenerationScreen}
      />
      <Stack.Screen
        name="ScanReceipt"
        component={ScanScreen}
        initialParams={{ mode: 'ticket' }}
      />
      <Stack.Screen
        name="ScanFridge"
        component={ScanScreen}
        initialParams={{ mode: 'fridge' }}
      />
    </Stack.Navigator>
  );
}

function AIStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AIHome" component={AIScreen} />
      <Stack.Screen name="WeeklyMenu" component={WeeklyMenuScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="Recettes" component={RecipesScreen} />
      <Tabs.Screen name="Frigo" component={FridgeStack} />
      <Tabs.Screen name="Courses" component={ShoppingScreen} />
      <Tabs.Screen name="Planning" component={PlanningScreen} />
      <Tabs.Screen name="IA" component={AIStack} />
    </Tabs.Navigator>
  );
}

function AppStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 250,
        }}
      />
      <Stack.Screen
        name="AddRecipe"
        component={AddRecipeScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 300,
          headerShown: true,
          title: 'Nouvelle recette',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
      <Stack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="EditRecipe"
        component={EditRecipeScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 300,
          headerShown: true,
          title: 'Modifier',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
      <Stack.Screen
        name="ChefAssistant"
        component={ChefAssistantScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CookingMode"
        component={CookingModeScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{
          headerShown: true,
          title: 'Aide',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{
          headerShown: true,
          title: 'Panneau Admin',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="AdminEditFeatured"
        component={AdminEditFeaturedScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 300,
          headerShown: true,
          title: 'Recette du catalogue',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
    </Stack.Navigator>
  );
}

// Navigation visiteur : accueil + auth + détail recette featured
function PublicStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="PublicHome" component={RecipesScreen} />
      <Stack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="SignIn"
        component={SignInScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 300,
          headerShown: true,
          title: 'Connexion',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
      <Stack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          animationDuration: 300,
          headerShown: true,
          title: 'Inscription',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
    </Stack.Navigator>
  );
}

function GatedStack({ isBanned, isApproved }) {
  if (isBanned) return <BannedScreen />;
  if (!isApproved) return <PendingApprovalScreen />;
  return <AppStack />;
}

export default function RootNavigator() {
  const { session, loading, profile, isBanned, isApproved } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Session présente mais profil pas encore chargé → loader court
  if (session && !profile) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? (
        <GatedStack isBanned={isBanned} isApproved={isApproved} />
      ) : (
        <PublicStack />
      )}
    </NavigationContainer>
  );
}

const createStyles = (colors) => StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  tabBar: {
    backgroundColor: colors.background,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    // Ombre vers le haut
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 -3px 10px rgba(0,0,0,0.06)' }
      : null),
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  pillPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  icon: {
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  labelActive: { color: colors.primary },
  labelInactive: { color: colors.textHint },
});
