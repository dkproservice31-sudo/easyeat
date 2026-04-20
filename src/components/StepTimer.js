import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Vibration } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// Timer countdown pour une étape de cuisson.
// - minutes : nombre entier positif (durée totale)
// - stepKey : change à chaque étape → reset complet du timer
export default function StepTimer({ minutes, stepKey }) {
  const { colors } = useTheme();
  const totalSec = Math.max(1, Math.round(minutes * 60));
  const [remaining, setRemaining] = useState(totalSec);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef(null);

  // Reset complet quand on change d'étape (ou si minutes change)
  useEffect(() => {
    setRemaining(totalSec);
    setRunning(false);
    setFinished(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [stepKey, totalSec]);

  // Cleanup sûr à l'unmount (évite les interval orphelins)
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Logique countdown
  useEffect(() => {
    if (!running) return undefined;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setRunning(false);
          setFinished(true);
          // 3 pulses courts à la fin
          try {
            Vibration.vibrate([0, 400, 200, 400, 200, 400]);
          } catch (e) {
            // ignoré si Vibration indisponible
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleStart = () => {
    setRunning(true);
    setFinished(false);
  };

  const handlePause = () => {
    setRunning(false);
  };

  const handleReset = () => {
    setRunning(false);
    setFinished(false);
    setRemaining(totalSec);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // État initial : pas démarré, pas fini, temps complet
  if (!running && !finished && remaining === totalSec) {
    return (
      <Pressable
        onPress={handleStart}
        style={({ pressed }) => [
          styles.timerBtn,
          { backgroundColor: colors.primary },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Démarrer un minuteur de ${minutes} minutes`}
      >
        <Text style={styles.timerBtnText}>⏲️ Démarrer {minutes} min</Text>
      </Pressable>
    );
  }

  // État terminé
  if (finished) {
    return (
      <View style={[styles.timerCard, styles.timerFinished]}>
        <Text style={styles.timerFinishedText}>✓ Terminé !</Text>
        <Pressable
          onPress={handleReset}
          style={({ pressed }) => [
            styles.timerResetBtn,
            { borderColor: '#22C55E' },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Relancer le minuteur"
        >
          <Text style={styles.timerResetText}>🔄 Relancer</Text>
        </Pressable>
      </View>
    );
  }

  // État en cours ou en pause
  return (
    <View
      style={[
        styles.timerCard,
        { backgroundColor: colors.surface, borderColor: colors.primary },
      ]}
    >
      <Text style={[styles.timerDisplay, { color: colors.primary }]}>
        {formatTime(remaining)}
      </Text>
      <View style={styles.timerActions}>
        {running ? (
          <Pressable
            onPress={handlePause}
            style={({ pressed }) => [
              styles.timerActionBtn,
              { backgroundColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Mettre en pause"
          >
            <Text style={[styles.timerActionText, { color: colors.text }]}>
              ⏸ Pause
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStart}
            style={({ pressed }) => [
              styles.timerActionBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Reprendre"
          >
            <Text style={[styles.timerActionText, { color: '#FFFFFF' }]}>
              ▶ Reprendre
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleReset}
          style={({ pressed }) => [
            styles.timerActionBtn,
            styles.timerActionBtnGhost,
            { borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Réinitialiser le minuteur"
        >
          <Text
            style={[
              styles.timerActionText,
              { color: colors.textSecondary },
            ]}
          >
            🔄 Reset
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timerBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
  },
  timerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  timerCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    marginTop: 16,
  },
  timerDisplay: {
    fontSize: 42,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginBottom: 12,
  },
  timerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  timerActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerActionBtnGhost: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  timerActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timerFinished: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22C55E',
  },
  timerFinishedText: {
    color: '#22C55E',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  timerResetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timerResetText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '700',
  },
});
