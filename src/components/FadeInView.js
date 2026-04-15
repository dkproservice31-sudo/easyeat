import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

// Fade-in + slide-up au montage. Réutilisable partout.
//   <FadeInView delay={100}><Card/></FadeInView>
export default function FadeInView({
  delay = 0,
  duration = 400,
  translate = 20,
  style,
  children,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(translate)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, delay, duration]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
