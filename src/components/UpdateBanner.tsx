import React from 'react';
import {Pressable, Text, View} from 'react-native';

import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';
import type {UpdateState} from '../state/useUpdates';

/**
 * Shown on the landing page only when a newer build actually exists.
 *
 * It can be dismissed, and dismissing remembers that version so the same
 * update does not nag on every launch — the next one still will.
 */
export function UpdateBanner({state}: {state: UpdateState}) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const {available, downloading, error, install, dismiss} = state;

  if (!available) {
    return null;
  }

  return (
    <View style={[styles.card, {boxShadow: `0 0 22px ${palette.glow}`}]}>
      <View style={styles.header}>
        <Text style={styles.badge}>UPDATE</Text>
        <Text style={styles.version}>Version {available.versionName}</Text>
      </View>

      <Text style={styles.notes}>
        {available.notes ?? 'A newer version of Persona is available.'}
      </Text>
      <Text style={styles.hint}>
        The download opens in your browser; tap the file to install it over
        this version. Your schedules and names are kept.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          disabled={downloading}
          onPress={dismiss}
          style={({pressed}) => [styles.ghost, pressed && styles.pressed]}>
          <Text style={styles.ghostText}>Later</Text>
        </Pressable>
        <Pressable
          disabled={downloading}
          onPress={install}
          style={({pressed}) => [
            styles.primary,
            pressed && styles.pressed,
            downloading && styles.disabled,
          ]}>
          <Text style={styles.primaryText}>
            {downloading ? 'Opening…' : 'Download'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  ({
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.accent,
      padding: spacing.lg,
    },
    header: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm},
    badge: {
      color: c.accent,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      marginRight: spacing.sm,
    },
    version: {color: c.text, fontSize: 15, fontWeight: '700'},
    notes: {color: c.textMuted, fontSize: 14, lineHeight: 20},
    hint: {color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm, opacity: 0.8},
    error: {color: c.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.sm},
    actions: {flexDirection: 'row', marginTop: spacing.lg},
    ghost: {
      flex: 1,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    ghostText: {color: c.textMuted, fontWeight: '600', fontSize: 15},
    primary: {
      flex: 1,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginLeft: spacing.sm,
    },
    primaryText: {color: '#fff', fontWeight: '700', fontSize: 15},
    pressed: {opacity: 0.85},
    disabled: {opacity: 0.6},
  }) as const;
