import React from 'react';
import {View} from 'react-native';

import {Colors, useThemedStyles} from '../theme';

/**
 * The lit backdrop every screen sits on.
 *
 * Two soft radial lights — one violet at the top, one blue low on the right —
 * are painted behind the content. Surfaces in the palette are translucent, so
 * each card picks up whichever light falls on it instead of being a flat
 * block. React Native 0.76 added native gradients, so this needs no drawing
 * library.
 */
export function Ambient({children}: {children: React.ReactNode}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.root}>
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  ({
    root: {flex: 1, backgroundColor: c.background},
    content: {flex: 1},
    glowTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `radial-gradient(circle at 18% 6%, ${c.ambientA} 0%, transparent 55%)`,
    },
    glowBottom: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `radial-gradient(ellipse at 95% 72%, ${c.ambientB} 0%, transparent 60%)`,
    },
  }) as const;
