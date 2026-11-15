import React from 'react';
import {Pressable, Text, View} from 'react-native';

import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';

/**
 * Initials stand in for a photo: contacts here are identified by number.
 * The tint is derived from the name, so the same contact keeps its colour
 * between launches without anything being stored.
 */
export function Avatar({
  name,
  active = false,
  size = 44,
  tinted = false,
}: {
  name: string;
  active?: boolean;
  size?: number;
  tinted?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] ?? '')
    .join('')
    .toUpperCase();

  const hue = hueFor(name);
  const tint = tinted && !active ? `hsla(${hue}, 60%, 60%, 0.22)` : undefined;
  const textTint = tinted && !active ? `hsl(${hue}, 70%, 72%)` : undefined;

  return (
    <View
      style={[
        styles.avatar,
        {width: size, height: size, borderRadius: size / 2},
        tint ? [styles.avatarTinted, {backgroundColor: tint}] : null,
        active && styles.avatarActive,
        active && {boxShadow: `0 0 16px ${palette.glow}`},
      ]}>
      <Text
        style={[
          styles.avatarText,
          {fontSize: size * 0.36},
          textTint ? {color: textTint} : null,
          active && styles.avatarTextActive,
        ]}>
        {initials || '#'}
      </Text>
    </View>
  );
}

/** Stable 0-359 hue from a string, so colours never shuffle. */
function hueFor(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

/** A small status pill, such as "Editable" next to a contact. */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'accent';
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={[
        styles.badge,
        tone === 'positive' && styles.badgePositive,
        tone === 'accent' && styles.badgeAccent,
      ]}>
      <Text
        style={[
          styles.badgeText,
          tone === 'positive' && styles.badgeTextPositive,
          tone === 'accent' && styles.badgeTextAccent,
        ]}>
        {label}
      </Text>
    </View>
  );
}

/** A rounded, glowing button used for stand-alone actions. */
export function GlowPill({
  label,
  tone = 'accent',
  disabled = false,
  onPress,
}: {
  label: string;
  tone?: 'accent' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const halo = tone === 'danger' ? palette.danger : palette.accent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.pill,
        tone === 'danger' ? styles.pillDanger : styles.pillAccent,
        {boxShadow: `0 0 18px ${withAlpha(halo, 0.35)}`},
        pressed && styles.pillPressed,
        disabled && styles.pillDisabled,
      ]}>
      <Text
        style={[
          styles.pillText,
          tone === 'danger' ? styles.pillTextDanger : styles.pillTextAccent,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Turns a hex or rgb colour into an rgba string at the given alpha. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

/**
 * One tappable entry on the landing page. [badge] carries the live number
 * that makes the card worth opening, such as how many slots exist.
 */
export function FeatureCard({
  icon,
  title,
  subtitle,
  badge,
  tone = 'default',
  disabled = false,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.feature,
        {
          boxShadow:
            tone === 'danger'
              ? `0 0 20px ${withAlpha(palette.danger, 0.22)}`
              : `0 0 20px ${palette.glow}`,
        },
        tone === 'danger' && styles.featureDanger,
        pressed && styles.featurePressed,
        disabled && styles.featureDisabled,
      ]}>
      <View style={[styles.featureIcon, tone === 'danger' && styles.dangerIcon]}>
        <Text style={styles.featureIconText}>{icon}</Text>
      </View>
      <View style={styles.featureText}>
        <Text
          style={[styles.featureTitle, tone === 'danger' && styles.dangerText]}>
          {title}
        </Text>
        <Text style={styles.featureSubtitle}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={[styles.countBadge, {boxShadow: `0 0 12px ${palette.glow}`}]}>
          <Text style={styles.countBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function ErrorBanner({message}: {message: string | null}) {
  const styles = useThemedStyles(makeStyles);
  if (!message) {
    return null;
  }
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function SectionLabel({children}: {children: React.ReactNode}) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

/** A plain glowing panel, for screens that lay out their own contents. */
export function GlowCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  return (
    <View style={[styles.glowCard, {boxShadow: `0 0 20px ${palette.glow}`}, style]}>
      {children}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  ({
    avatar: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarTinted: {borderColor: 'transparent'},
    avatarActive: {backgroundColor: c.accent, borderColor: c.accent},
    avatarText: {color: c.textMuted, fontWeight: '700'},
    avatarTextActive: {color: c.accentText},

    badge: {
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    badgePositive: {
      backgroundColor: 'rgba(47,217,143,0.16)',
      borderColor: 'rgba(47,217,143,0.45)',
    },
    badgeAccent: {backgroundColor: c.accentMuted, borderColor: c.accent},
    badgeText: {color: c.textMuted, fontSize: 12, fontWeight: '600'},
    badgeTextPositive: {color: c.success},
    badgeTextAccent: {color: c.accent},

    pill: {
      alignSelf: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    pillAccent: {backgroundColor: c.accentMuted, borderColor: c.accent},
    pillDanger: {
      backgroundColor: 'rgba(255,107,107,0.12)',
      borderColor: c.danger,
    },
    pillPressed: {opacity: 0.75},
    pillDisabled: {opacity: 0.5},
    pillText: {fontSize: 15, fontWeight: '700'},
    pillTextAccent: {color: c.accent},
    pillTextDanger: {color: c.danger},

    feature: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md + 2,
    },
    featureDanger: {borderColor: 'rgba(255,107,107,0.45)'},
    featurePressed: {backgroundColor: c.surfaceAlt},
    featureDisabled: {opacity: 0.5},
    featureIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    dangerIcon: {
      backgroundColor: 'rgba(255,107,107,0.12)',
      borderColor: 'rgba(255,107,107,0.4)',
    },
    featureIconText: {fontSize: 18},
    featureText: {flex: 1},
    featureTitle: {color: c.text, fontSize: 16, fontWeight: '700'},
    dangerText: {color: c.danger},
    featureSubtitle: {color: c.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18},
    countBadge: {
      minWidth: 26,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    countBadgeText: {color: c.accentText, fontSize: 12, fontWeight: '700'},
    chevron: {color: c.textMuted, fontSize: 22, marginTop: -2},

    glowCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
    },

    errorBox: {
      backgroundColor: c.surface,
      borderLeftWidth: 3,
      borderLeftColor: c.danger,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    errorText: {color: c.danger, fontSize: 13, lineHeight: 19},

    sectionLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
  }) as const;
