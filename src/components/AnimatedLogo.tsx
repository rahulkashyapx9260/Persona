import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Text, View} from 'react-native';

import {Colors, useColors, useThemedStyles} from '../theme';

const MARK_BLUE = '#1C84F5';

/**
 * The app mark in the top-left of the landing page: two figures on a blue
 * tile, matching the launcher icon.
 *
 * It is composed from plain views rather than SVG so the app keeps no extra
 * dependency, and the halo behind it breathes on the native driver so the
 * motion never stutters while the list below is loading.
 */
export function AnimatedLogo({size = 46}: {size?: number}) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    breathing.start();
    return () => breathing.stop();
  }, [pulse]);

  const scale = pulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.06]});
  const glow = pulse.interpolate({inputRange: [0, 1], outputRange: [0.3, 0.6]});

  // Every part is a fraction of the tile, so one size prop scales the mark.
  const u = size / 108;

  return (
    <View style={styles.row}>
      <View style={[styles.wrap, {width: size, height: size}]}>
        <Animated.View
          style={[
            styles.halo,
            {
              width: size,
              height: size,
              borderRadius: size * 0.24,
              opacity: glow,
              transform: [{scale}],
            },
          ]}
        />
        <View
          style={[
            styles.tile,
            {
              width: size,
              height: size,
              borderRadius: size * 0.24,
              boxShadow: `0 0 16px ${palette.glow}`,
            },
          ]}>
          {/* Smaller figure, behind and to the right. */}
          <View
            style={[
              styles.piece,
              {
                left: 59.5 * u,
                top: 33 * u,
                width: 20 * u,
                height: 20 * u,
                borderRadius: 10 * u,
              },
            ]}
          />
          <View
            style={[
              styles.piece,
              {
                left: 60 * u,
                top: 56 * u,
                width: 19 * u,
                height: 26 * u,
                borderTopLeftRadius: 9.5 * u,
                borderTopRightRadius: 9.5 * u,
                borderBottomLeftRadius: 8 * u,
                borderBottomRightRadius: 8 * u,
              },
            ]}
          />

          {/* Larger figure, in front. */}
          <View
            style={[
              styles.piece,
              {
                left: 30.5 * u,
                top: 25 * u,
                width: 25 * u,
                height: 25 * u,
                borderRadius: 12.5 * u,
              },
            ]}
          />
          <View
            style={[
              styles.piece,
              {
                left: 29 * u,
                top: 52 * u,
                width: 28 * u,
                height: 31 * u,
                borderTopLeftRadius: 13 * u,
                borderTopRightRadius: 13 * u,
                borderBottomLeftRadius: 9 * u,
                borderBottomRightRadius: 9 * u,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.wordmark}>
        <Text style={styles.name}>Persona</Text>
        <Text style={styles.tagline}>names on a schedule</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  ({
    row: {flexDirection: 'row', alignItems: 'center'},
    wrap: {alignItems: 'center', justifyContent: 'center'},
    halo: {position: 'absolute', backgroundColor: MARK_BLUE},
    tile: {backgroundColor: MARK_BLUE, overflow: 'hidden'},
    piece: {position: 'absolute', backgroundColor: '#ffffff'},
    wordmark: {marginLeft: 12},
    name: {color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.2},
    tagline: {color: c.textMuted, fontSize: 11, marginTop: 1},
  }) as const;
