import React, {useEffect, useRef} from 'react';
import {Animated, Easing, View} from 'react-native';

import {Colors, radius, spacing, useThemedStyles} from '../theme';

/**
 * Placeholder rows shown while a list is being fetched.
 *
 * They match the real row's shape, so the list does not jump when results
 * arrive, and a single shared opacity loop drives every block — one animation
 * rather than one per placeholder.
 */
export function ContactSkeleton({rows = 7}: {rows?: number}) {
  const styles = useThemedStyles(makeStyles);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.75],
  });

  return (
    <View accessibilityLabel="Loading contacts">
      {Array.from({length: rows}).map((_, index) => (
        <Animated.View key={index} style={[styles.row, {opacity}]}>
          <View style={styles.avatar} />
          <View style={styles.text}>
            {/* Alternating widths so the block does not look like a table. */}
            <View style={[styles.line, index % 2 ? styles.lineShort : null]} />
            <View style={styles.lineSmall} />
          </View>
          <View style={styles.pill} />
        </Animated.View>
      ))}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  ({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.surfaceAlt,
    },
    text: {flex: 1, marginHorizontal: spacing.md},
    line: {
      height: 12,
      width: '62%',
      borderRadius: radius.sm,
      backgroundColor: c.surfaceAlt,
    },
    lineShort: {width: '45%'},
    lineSmall: {
      height: 10,
      width: '38%',
      borderRadius: radius.sm,
      backgroundColor: c.surfaceAlt,
      marginTop: spacing.sm,
    },
    pill: {
      width: 68,
      height: 24,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
    },
  }) as const;
