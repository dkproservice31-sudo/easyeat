import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Easing, StyleSheet, View, Text } from 'react-native';
import Svg, { Rect, Circle, Ellipse, Line, Text as SvgText } from 'react-native-svg';

const CORPS_BASE = '#5A6D82';
const CORPS_HIGHLIGHT = '#7A8EA4';
const CORPS_SHADOW = '#3A4A5C';
const HANDLE_BASE = '#2C3643';
const HANDLE_HIGHLIGHT = '#8799B0';
const SCREEN_BG = '#0E1419';
const LED_GREEN = '#4ADE80';
const FOOT = '#1A1F26';
const INTERIOR_BG = '#1C2128';
const GLOW = '#FFE8A0';

export default function AnimatedFridge({
  onPress,
  itemCount = 0,
  width = 220,
  height,
  emptyState = false,
}) {
  const computedHeight = height || width * 1.7;
  const scaleX = width / 200;
  const scaleY = computedHeight / 340;

  const [internalOpen, setInternalOpen] = useState(false);

  const breatheAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;
  const ledAnim = useRef(new Animated.Value(1)).current;
  const openAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    );
    const led = Animated.loop(
      Animated.sequence([
        Animated.timing(ledAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(ledAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    breathe.start();
    led.start();
    return () => {
      breathe.stop();
      led.stop();
    };
  }, [breatheAnim, ledAnim]);

  useEffect(() => {
    Animated.timing(openAnim, {
      toValue: internalOpen ? 1 : 0,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [internalOpen, openAnim]);

  const wrapperScale = Animated.multiply(
    breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }),
    pressAnim
  );

  const doorRotation = openAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-15deg'],
  });

  const handlePress = () => {
    setInternalOpen(true);
    setTimeout(() => {
      if (onPress) onPress();
      setTimeout(() => setInternalOpen(false), 300);
    }, 600);
  };

  const pressIn = () =>
    Animated.spring(pressAnim, { toValue: 0.97, useNativeDriver: true, friction: 8 }).start();
  const pressOut = () =>
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();

  const doorLeft = 14 * scaleX;
  const doorTop = 148 * scaleY;
  const doorWidth = 172 * scaleX;
  const doorHeight = 180 * scaleY;

  const ledSize = 6;
  const ledLeft = 116 * scaleX - ledSize / 2;
  const ledTop = 34 * scaleY - ledSize / 2;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityLabel="Ouvrir le frigo"
      accessibilityRole="button"
    >
      <Animated.View style={{ width, height: computedHeight, transform: [{ scale: wrapperScale }] }}>
        <Svg width={width} height={computedHeight} viewBox="0 0 200 340">
          {/* Halo extérieur discret pour détacher du fond */}
          <Rect
            x="6"
            y="6"
            width="188"
            height="324"
            rx="20"
            fill="none"
            stroke="rgba(135,153,176,0.15)"
            strokeWidth="2"
          />

          {/* Ombre au sol */}
          <Ellipse cx="100" cy="336" rx="80" ry="4" fill="rgba(0,0,0,0.35)" />

          {/* Pieds */}
          <Rect x="30" y="326" width="22" height="10" rx="2" fill={FOOT} />
          <Rect x="148" y="326" width="22" height="10" rx="2" fill={FOOT} />

          {/* Corps frigo */}
          <Rect x="8" y="8" width="184" height="320" rx="18" fill={CORPS_BASE} />
          <Rect x="60" y="8" width="80" height="320" fill={CORPS_HIGHLIGHT} opacity="0.4" />
          <Rect
            x="8"
            y="8"
            width="184"
            height="320"
            rx="18"
            fill="none"
            stroke={CORPS_SHADOW}
            strokeWidth="1"
          />

          {/* Porte du haut (congélateur) */}
          <Rect
            x="14"
            y="14"
            width="172"
            height="126"
            rx="12"
            fill={CORPS_BASE}
            stroke={CORPS_SHADOW}
            strokeWidth="0.5"
          />
          <Rect x="60" y="14" width="80" height="126" fill={CORPS_HIGHLIGHT} opacity="0.25" />
          {/* Reflets latéraux porte haut */}
          <Rect x="22" y="18" width="3" height="118" rx="1.5" fill="rgba(255,255,255,0.12)" />
          <Rect x="175" y="18" width="3" height="118" rx="1.5" fill="rgba(255,255,255,0.08)" />
          {/* Bordure interne porte haut */}
          <Rect
            x="18"
            y="18"
            width="164"
            height="118"
            rx="9"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.5"
          />

          {/* Poignée porte haut */}
          <Rect x="19" y="35" width="8" height="65" rx="4" fill={HANDLE_BASE} />
          <Rect x="20" y="36" width="6" height="63" rx="3" fill={HANDLE_HIGHLIGHT} />
          <Rect x="20" y="36" width="6" height="30" rx="3" fill="rgba(255,255,255,0.2)" />

          {/* Écran LED */}
          <Rect x="126" y="24" width="46" height="20" rx="4" fill={SCREEN_BG} />
          <SvgText
            x="149"
            y="38"
            textAnchor="middle"
            fontSize="11"
            fontFamily="Menlo, Monaco, Consolas, monospace"
            fill={LED_GREEN}
            fontWeight="bold"
          >
            -2°C
          </SvgText>

          {/* Séparation entre les 2 portes — ombre + highlight pour effet 3D */}
          <Rect x="14" y="138" width="172" height="2" fill="rgba(0,0,0,0.35)" />
          <Rect x="14" y="141" width="172" height="1" fill="rgba(255,255,255,0.1)" />

          {/* Intérieur du frigo (visible quand porte bas tourne) */}
          <Rect x="14" y="148" width="172" height="180" rx="12" fill={INTERIOR_BG} />
          <Rect x="14" y="148" width="172" height="180" rx="12" fill={GLOW} opacity="0.12" />
          <Line x1="20" y1="195" x2="180" y2="195" stroke="rgba(255,220,160,0.25)" strokeWidth="1" />
          <Line x1="20" y1="240" x2="180" y2="240" stroke="rgba(255,220,160,0.25)" strokeWidth="1" />
          <Line x1="20" y1="285" x2="180" y2="285" stroke="rgba(255,220,160,0.25)" strokeWidth="1" />

          {/* Logo EASYEAT gravé discret */}
          <SvgText
            x="178"
            y="324"
            textAnchor="end"
            fontSize="6"
            fontFamily="sans-serif"
            fill="rgba(255,255,255,0.3)"
            fontWeight="bold"
          >
            EASYEAT
          </SvgText>
        </Svg>

        {/* Overlay "Frigo vide" sur la porte haute, affiché seulement si emptyState */}
        {emptyState && (
          <View
            pointerEvents="none"
            style={[styles.emptyOverlay, { top: computedHeight * 0.25 }]}
          >
            <Text style={styles.emptyTitle}>Frigo vide</Text>
            <Text style={styles.emptyHint}>Tape pour le remplir</Text>
          </View>
        )}

        {/* LED témoin pulsante (Animated.View absolue pour garder useNativeDriver) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.led,
            {
              left: ledLeft,
              top: ledTop,
              width: ledSize,
              height: ledSize,
              borderRadius: ledSize / 2,
              opacity: ledAnim,
            },
          ]}
        />

        {/* Porte du bas — Animated.View par-dessus avec rotate + transformOrigin left center */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: doorLeft,
            top: doorTop,
            width: doorWidth,
            height: doorHeight,
            transformOrigin: 'left center',
            transform: [{ rotate: doorRotation }],
          }}
        >
          <Svg width={doorWidth} height={doorHeight} viewBox="0 0 172 180">
            <Rect
              x="0"
              y="0"
              width="172"
              height="180"
              rx="12"
              fill={CORPS_BASE}
              stroke={CORPS_SHADOW}
              strokeWidth="0.5"
            />
            <Rect x="46" y="0" width="80" height="180" fill={CORPS_HIGHLIGHT} opacity="0.25" />
            {/* Reflets latéraux porte bas */}
            <Rect x="8" y="4" width="3" height="172" rx="1.5" fill="rgba(255,255,255,0.12)" />
            <Rect x="161" y="4" width="3" height="172" rx="1.5" fill="rgba(255,255,255,0.08)" />
            {/* Bordure interne porte bas */}
            <Rect
              x="4"
              y="4"
              width="164"
              height="172"
              rx="9"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="0.5"
            />
            {/* Poignée porte bas */}
            <Rect x="5" y="47" width="8" height="65" rx="4" fill={HANDLE_BASE} />
            <Rect x="6" y="48" width="6" height="63" rx="3" fill={HANDLE_HIGHLIGHT} />
            <Rect x="6" y="48" width="6" height="30" rx="3" fill="rgba(255,255,255,0.2)" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  led: {
    position: 'absolute',
    backgroundColor: LED_GREEN,
  },
  emptyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  emptyHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
});
