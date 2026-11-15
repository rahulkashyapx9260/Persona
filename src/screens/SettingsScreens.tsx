import React from 'react';
import {Pressable, ScrollView, Switch, Text, View} from 'react-native';

import {ErrorBanner, FeatureCard, SectionLabel} from '../components/ui';
import {useNavigation} from '../navigation/Navigator';
import {
  ContactNames,
  requestNotificationPermission,
} from '../native/ContactNames';
import {useAppData} from '../state/AppData';
import {
  Colors,
  ThemeMode,
  radius,
  spacing,
  useColors,
  useIsDark,
  useThemeMode,
  useThemedStyles,
} from '../theme';
import type {ScreenName} from './routes';

// ------------------------------------------------------------ notifications

export function NotificationsScreen() {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const {notifications, busy, error, runAction} = useAppData();

  const enabled = Boolean(notifications?.enabled);
  const blocked = enabled && !notifications?.permissionGranted;

  const toggle = (value: boolean) =>
    runAction('notify', async () => {
      // Asking only when switching on keeps the system dialog out of the way.
      if (value) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          throw new Error(
            'Notifications are blocked for this app. Enable them in Settings > Apps > Persona > Notifications.',
          );
        }
      }
      await ContactNames.setNotificationsEnabled(value);
    });

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <ErrorBanner message={error} />

      <View style={styles.card}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{checked: enabled}}
          disabled={busy !== null}
          onPress={() => toggle(!enabled)}
          style={styles.plainRow}>
          <View style={styles.switchText}>
            <Text style={styles.title}>Notify on change</Text>
            <Text style={styles.paragraph}>
              Post a notification each time a contact is renamed, so you can
              see the switch happened without opening the app.
            </Text>
          </View>
          <Switch
            value={enabled}
            disabled={busy !== null}
            onValueChange={toggle}
            trackColor={{true: palette.accentMuted, false: palette.border}}
            thumbColor={enabled ? palette.accent : palette.textMuted}
          />
        </Pressable>
      </View>

      {blocked ? (
        <View style={[styles.card, styles.warningCard]}>
          <Text style={styles.warningText}>
            Android has not granted notification access yet, so nothing can be
            posted.
          </Text>
          <Pressable
            style={styles.primaryButton}
            disabled={busy !== null}
            onPress={() =>
              runAction('notify-grant', async () => {
                const granted = await requestNotificationPermission();
                if (!granted) {
                  throw new Error(
                    'Still blocked. Enable notifications in Settings > Apps > Persona > Notifications.',
                  );
                }
              })
            }>
            <Text style={styles.primaryButtonText}>Allow notifications</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ------------------------------------------------------------------- alarms

export function AlarmsScreen() {
  const styles = useThemedStyles(makeStyles);
  const {permissions, batteryUnrestricted, busy, error, runAction} = useAppData();
  const exact = Boolean(permissions?.exactAlarm);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <ErrorBanner message={error} />

      <View style={[styles.card, !exact && styles.warningCard]}>
        <Text style={styles.title}>
          {exact ? 'Timing is exact' : 'Timing is approximate'}
        </Text>
        <Text style={styles.paragraph}>
          {exact
            ? 'Name changes land on the minute you asked for.'
            : 'Names still switch, but up to a few minutes late. Allow exact alarms for on-the-minute changes.'}
        </Text>
        {!exact ? (
          <Pressable
            style={styles.primaryButton}
            disabled={busy !== null}
            onPress={() =>
              runAction('alarm', () => ContactNames.openExactAlarmSettings())
            }>
            <Text style={styles.primaryButtonText}>Open alarm settings</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.card, !batteryUnrestricted && styles.warningCard]}>
        <Text style={styles.title}>
          {batteryUnrestricted
            ? 'Allowed to run in the background'
            : 'Battery saver may delay changes'}
        </Text>
        <Text style={styles.paragraph}>
          {batteryUnrestricted
            ? 'Android is not deferring this app, so a change still happens while the phone is idle.'
            : 'Android pauses background apps to save power, which can push a name change past its time. Allowing Persona to run unrestricted fixes that.'}
        </Text>
        {!batteryUnrestricted ? (
          <Pressable
            style={styles.primaryButton}
            disabled={busy !== null}
            onPress={() =>
              runAction('battery', () =>
                ContactNames.requestBatteryUnrestricted(),
              )
            }>
            <Text style={styles.primaryButtonText}>Allow background</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>If a change still arrives late</Text>
        <Text style={styles.paragraph}>
          Some phones add their own power manager on top of Android's. Lock
          Persona in the recents screen, and allow background activity in your
          phone's battery settings. Because the app works out the right name
          rather than replaying missed events, a skipped change corrects itself
          at the next boundary, at restart, or when you open the app.
        </Text>
      </View>
    </ScrollView>
  );
}

// ----------------------------------------------------------------- settings

/**
 * Reached from the gear in the landing header. The theme lives here rather
 * than on its own page because switching it is the thing people come for.
 */
export function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const nav = useNavigation<ScreenName>();
  const [mode, setMode] = useThemeMode();
  const {notifications, permissions, batteryUnrestricted} = useAppData();

  const followSystem = mode === 'system';
  const isDark = useIsDark();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <SectionLabel>Theme</SectionLabel>

      <View style={styles.themeCard}>
        {/* The whole row is the control — tapping the text toggles too, so
            the switch is never the only target. */}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{checked: isDark, disabled: followSystem}}
          disabled={followSystem}
          onPress={() => setMode(isDark ? 'light' : 'dark')}
          style={({pressed}) => [
            styles.switchRow,
            pressed && styles.rowPressed,
            followSystem && styles.rowDisabled,
          ]}>
          <View style={styles.switchText}>
            <Text style={styles.title}>Dark theme</Text>
            <Text style={styles.paragraph}>
              {followSystem
                ? `Currently ${isDark ? 'dark' : 'light'}, set by your device.`
                : 'Switch the whole app between light and dark.'}
            </Text>
          </View>
          <Switch
            value={isDark}
            disabled={followSystem}
            onValueChange={value => setMode(value ? 'dark' : 'light')}
            trackColor={{true: palette.accentMuted, false: palette.border}}
            thumbColor={isDark ? palette.accent : palette.textMuted}
          />
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{checked: followSystem}}
          onPress={() =>
            setMode(followSystem ? (isDark ? 'dark' : 'light') : 'system')
          }
          style={({pressed}) => [styles.switchRow, pressed && styles.rowPressed]}>
          <View style={styles.switchText}>
            <Text style={styles.title}>Follow system</Text>
            <Text style={styles.paragraph}>
              Let the device's light or dark setting decide.
            </Text>
          </View>
          <Switch
            value={followSystem}
            onValueChange={value =>
              setMode(value ? 'system' : isDark ? 'dark' : 'light')
            }
            trackColor={{true: palette.accentMuted, false: palette.border}}
            thumbColor={followSystem ? palette.accent : palette.textMuted}
          />
        </Pressable>
      </View>

      <SectionLabel>More</SectionLabel>

      <FeatureCard
        icon="🔔"
        title="Notifications"
        subtitle={
          notifications?.enabled
            ? notifications.permissionGranted
              ? 'On — you are told about each rename'
              : 'On, but Android is still blocking them'
            : 'Off'
        }
        onPress={() => nav.push('notifications')}
      />

      <FeatureCard
        icon="⏰"
        title="Timing & background"
        subtitle={
          permissions?.exactAlarm && batteryUnrestricted
            ? 'Exact, and allowed to run in the background'
            : 'Changes may arrive late — worth a look'
        }
        onPress={() => nav.push('alarms')}
      />
    </ScrollView>
  );
}

// --------------------------------------------------------------- appearance

const MODES: Array<{mode: ThemeMode; label: string; hint: string}> = [
  {mode: 'system', label: 'System', hint: 'Follow the device setting'},
  {mode: 'light', label: 'Light', hint: 'Always light'},
  {mode: 'dark', label: 'Dark', hint: 'Always dark'},
];

export function AppearanceScreen() {
  const styles = useThemedStyles(makeStyles);
  const [mode, setMode] = useThemeMode();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Theme</Text>
        <Text style={styles.paragraph}>
          Your choice is remembered, and applies the moment you pick it.
        </Text>

        <View style={styles.modeList}>
          {MODES.map(option => {
            const selected = mode === option.mode;
            return (
              <Pressable
                key={option.mode}
                accessibilityRole="radio"
                accessibilityState={{selected}}
                onPress={() => setMode(option.mode)}
                style={[styles.mode, selected && styles.modeSelected]}>
                <View style={styles.modeText}>
                  <Text
                    style={[
                      styles.modeLabel,
                      selected && styles.modeLabelSelected,
                    ]}>
                    {option.label}
                  </Text>
                  <Text style={styles.modeHint}>{option.hint}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  ({
    screen: {flex: 1, backgroundColor: 'transparent'},
    content: {padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md},
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      gap: spacing.md,
      boxShadow: `0 0 20px ${c.glow}`,
    },
    warningCard: {borderColor: c.warning},
    title: {color: c.text, fontSize: 17, fontWeight: '700'},
    paragraph: {color: c.textMuted, fontSize: 14, lineHeight: 20},
    warningText: {color: c.warning, fontSize: 14, lineHeight: 20},
    themeCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      boxShadow: `0 0 20px ${c.glow}`,
      overflow: 'hidden',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    plainRow: {flexDirection: 'row', alignItems: 'center'},
    rowPressed: {backgroundColor: c.surfaceAlt},
    rowDisabled: {opacity: 0.6},
    switchText: {flex: 1, paddingRight: spacing.md},
    divider: {height: 1, backgroundColor: c.border},
    primaryButton: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    primaryButtonText: {color: c.accentText, fontWeight: '700', fontSize: 15},

    modeList: {gap: spacing.sm},
    mode: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    modeSelected: {borderColor: c.accent, backgroundColor: c.accentMuted},
    modeText: {flex: 1},
    modeLabel: {color: c.text, fontSize: 15, fontWeight: '600'},
    modeLabelSelected: {color: c.accent},
    modeHint: {color: c.textMuted, fontSize: 12, marginTop: 2},
    radio: {
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: {borderColor: c.accent},
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
    },
  }) as const;
