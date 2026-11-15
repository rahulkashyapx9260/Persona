import React, {useCallback, useEffect, useState} from 'react';
import {Animated, Easing, Pressable, Text, View} from 'react-native';

import {AnimatedLogo} from '../components/AnimatedLogo';
import {ErrorBanner} from '../components/ui';
import {
  ContactNames,
  requestContactsPermissions,
  requestNotificationPermission,
} from '../native/ContactNames';
import {useAppData} from '../state/AppData';
import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';

/**
 * First-run flow.
 *
 * Android asks for each permission in its own system dialog, and scattering
 * those across the app makes a new install feel broken. Here they are walked
 * through once, in the order they matter, each with a plain sentence saying
 * why. Everything except contacts can be skipped — the app still works, just
 * less precisely — so nobody is trapped on this screen.
 */
export function OnboardingScreen({onDone}: {onDone: () => void}) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const {refresh} = useAppData();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fade = useRef0();

  // Each step slides in, so moving forward reads as progress.
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, fade]);

  const advance = useCallback(() => {
    setError(null);
    setStep(current => current + 1);
  }, []);

  const finish = useCallback(async () => {
    await ContactNames.setPreference('onboarded', '1').catch(() => {});
    await refresh();
    onDone();
  }, [refresh, onDone]);

  const run = async (action: () => Promise<unknown>, required: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      advance();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (required) {
        setError(message);
      } else {
        advance();
      }
    } finally {
      setBusy(false);
    }
  };

  const steps: Array<{
    title: string;
    body: string;
    action: string;
    skip?: string;
    onAction: () => void;
  }> = [
    {
      title: 'Names that follow the clock',
      body: 'Give a contact a different name for a time of day, and Persona rewrites it on your phone when that time comes — then puts the original back.',
      action: 'Get started',
      onAction: advance,
    },
    {
      title: 'Access to your contacts',
      body: 'Persona needs to read your contacts to find the number, and to write to rename it. Nothing is uploaded anywhere — every change happens on this phone.',
      action: 'Allow contacts',
      onAction: () =>
        run(async () => {
          const granted = await requestContactsPermissions();
          if (!granted) {
            throw new Error(
              'Persona cannot work without contacts access. Tap again, or grant it in Settings > Apps > Persona > Permissions.',
            );
          }
        }, true),
    },
    {
      title: 'Tell you when a name changes',
      body: 'A quiet notification each time a contact is renamed, so you always know what your phone is showing.',
      action: 'Allow notifications',
      skip: 'Not now',
      onAction: () => run(() => requestNotificationPermission(), false),
    },
    {
      title: 'Let it run on time',
      body: 'Android pauses background apps to save battery, which can make a name change arrive late. Allowing Persona to run unrestricted keeps changes on the minute.',
      action: 'Allow background',
      skip: 'Not now',
      onAction: () => run(() => ContactNames.requestBatteryUnrestricted(), false),
    },
    {
      title: 'One thing worth knowing',
      body: 'Your original names are backed up inside Persona. Uninstalling the app deletes that backup, so run “Restore all names” first — otherwise renamed contacts keep their new names.',
      action: 'I understand',
      onAction: finish,
    },
  ];

  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <View style={styles.root}>
      <View style={styles.logoRow}>
        <AnimatedLogo size={40} />
      </View>

      <Animated.View
        style={[
          styles.body,
          {
            opacity: fade,
            transform: [
              {
                translateY: fade.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          },
        ]}>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.paragraph}>{current.body}</Text>
        <ErrorBanner message={error} />
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {steps.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === step && styles.dotOn]}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={current.onAction}
          style={({pressed}) => [
            styles.primary,
            {boxShadow: `0 0 24px ${palette.glow}`},
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}>
          <Text style={styles.primaryText}>
            {busy ? 'Just a moment…' : current.action}
          </Text>
        </Pressable>

        {current.skip ? (
          <Pressable disabled={busy} onPress={advance} hitSlop={10}>
            <Text style={styles.skip}>{current.skip}</Text>
          </Pressable>
        ) : (
          <View style={styles.skipSpacer} />
        )}
      </View>
    </View>
  );
}

/** A stable Animated.Value without pulling useRef into the import list twice. */
function useRef0(): Animated.Value {
  const [value] = useState(() => new Animated.Value(0));
  return value;
}

const makeStyles = (c: Colors) =>
  ({
    root: {flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl},
    logoRow: {paddingTop: spacing.lg},
    body: {flex: 1, justifyContent: 'center'},
    title: {
      color: c.text,
      fontSize: 30,
      fontWeight: '800',
      lineHeight: 38,
      marginBottom: spacing.lg,
    },
    paragraph: {
      color: c.textMuted,
      fontSize: 16,
      lineHeight: 25,
      marginBottom: spacing.lg,
    },
    footer: {alignItems: 'stretch'},
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: radius.pill,
      backgroundColor: c.border,
      marginHorizontal: 4,
    },
    dotOn: {backgroundColor: c.accent, width: 20},
    primary: {
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      paddingVertical: spacing.lg,
      alignItems: 'center',
    },
    pressed: {opacity: 0.9},
    disabled: {opacity: 0.6},
    primaryText: {color: '#fff', fontSize: 17, fontWeight: '700'},
    skip: {
      color: c.textMuted,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    skipSpacer: {height: spacing.xl + spacing.lg},
  }) as const;
