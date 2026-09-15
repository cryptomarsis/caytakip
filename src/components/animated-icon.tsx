import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600;

export function AnimatedSplashOverlay({ onFinished }: { onFinished?: () => void } = {}) {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => { setVisible(false); onFinished?.(); }, 1050);
    return () => clearTimeout(timer);
  }, [animate, onFinished]);

  if (!visible) return null;

  const splashLogoKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 0.86 }],
      opacity: 0,
    },
    38: {
      transform: [{ scale: 1.04 }],
      opacity: 1,
      easing: Easing.out(Easing.cubic),
    },
    72: {
      transform: [{ scale: 1 }],
      opacity: 1,
      easing: Easing.inOut(Easing.cubic),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 0.98 }],
      easing: Easing.in(Easing.cubic),
    },
  });

  const image = (
    <Image
      accessibilityLabel="Çaylık logosu"
      contentFit="cover"
      style={styles.splashLogo}
      source={require('@/assets/caylik-icon-v1.png')}
    />
  );

  return animate ? (
    <View style={styles.splashOverlay}>
      <Animated.View entering={splashLogoKeyframe.duration(1000)}>{image}</Animated.View>
    </View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    width: 76,
    height: 71,
  },
  background: {
    borderRadius: 40,
    experimental_backgroundImage: `linear-gradient(180deg, #3C9FFE, #0274DF)`,
    width: 128,
    height: 128,
    position: 'absolute',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8F3E7',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  splashLogo: {
    width: 148,
    height: 148,
    borderRadius: 34,
  },
});
