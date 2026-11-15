import React, {useState} from 'react';
import {Pressable, RefreshControl, ScrollView, Text, View} from 'react-native';

import {AnimatedLogo} from '../components/AnimatedLogo';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {ContactPickerModal} from '../components/ContactPickerModal';
import {ErrorBanner, FeatureCard, SectionLabel} from '../components/ui';
import {UpdateBanner} from '../components/UpdateBanner';
import {useNavigation} from '../navigation/Navigator';
import {Contact, ContactNames} from '../native/ContactNames';
import {useAppData} from '../state/AppData';
import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';
import {formatClock} from '../time';
import type {ScreenName} from './routes';

export function LandingScreen() {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const nav = useNavigation<ScreenName>();
  const {
    permissions,
    status,
    groups,
    history,
    notifications,
    batteryUnrestricted,
    updates,
    loading,
    busy,
    error,
    refresh,
    runAction,
  } = useAppData();

  const [pickerVisible, setPickerVisible] = useState(false);

  const slotCount = status?.scheduleCount ?? 0;
  const contactCount = status?.trackedContacts ?? 0;

  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  const doRestoreAll = () =>
    runAction('restore', async () => {
      const result = await ContactNames.restoreAll();
      setConfirmRestore(false);
      setRestoreResult(
        `${result.changed} contact${result.changed === 1 ? '' : 's'} restored` +
          (result.failed ? `, ${result.failed} could not be changed.` : '.'),
      );
    });

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refresh}
          tintColor={palette.accent}
          colors={[palette.accent]}
        />
      }>
      <View style={styles.logoRow}>
        <AnimatedLogo />
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={10}
          onPress={() => nav.push('settings')}
          style={({pressed}) => [styles.gear, pressed && styles.gearPressed]}>
          <Text style={styles.gearIcon}>⚙</Text>
        </Pressable>
      </View>

      <ErrorBanner message={error} />
      <UpdateBanner state={updates} />

      {/* ------------------------------------------------------------- hero */}
      <Pressable
        accessibilityRole="button"
        disabled={!permissions?.contacts}
        onPress={() => setPickerVisible(true)}
        style={({pressed}) => [
          styles.hero,
          {boxShadow: `0 0 28px rgba(79,140,255,0.45)`},
          pressed && styles.heroPressed,
          !permissions?.contacts && styles.heroDisabled,
        ]}>
        <View style={styles.heroPlus}>
          <Text style={styles.heroPlusText}>+</Text>
        </View>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Add a contact</Text>
          <Text style={styles.heroSubtitle}>
            Pick a number, then give it names by time of day.
          </Text>
        </View>
      </Pressable>

      {/* ------------------------------------------------------------ stats */}
      <View style={styles.statCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{contactCount}</Text>
          <Text style={styles.statLabel}>contacts</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{slotCount}</Text>
          <Text style={styles.statLabel}>time slots</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItemWide}>
          <Text style={styles.statValue}>
            {formatClock(status?.nextRunAt ?? null)}
          </Text>
          <Text style={styles.statLabel}>next change</Text>
        </View>
      </View>

      {/* ------------------------------------------------------- the pieces */}
      <SectionLabel>Manage</SectionLabel>

      <FeatureCard
        icon="👥"
        title="Contacts & schedules"
        subtitle={
          groups.length === 0
            ? 'Nothing scheduled yet'
            : `${groups.length} managed · ${slotCount} slot${
                slotCount === 1 ? '' : 's'
              }`
        }
        badge={groups.length ? String(groups.length) : undefined}
        disabled={!permissions?.contacts}
        onPress={() => nav.push('contacts')}
      />

      <FeatureCard
        icon="🕓"
        title="History"
        subtitle={
          history.length === 0
            ? 'No name changes recorded yet'
            : `${history.length} change${history.length === 1 ? '' : 's'} recorded`
        }
        badge={history.length ? String(history.length) : undefined}
        disabled={!permissions?.contacts}
        onPress={() => nav.push('history')}
      />

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
            ? 'Changes land on the minute'
            : 'Changes may arrive late — worth a look'
        }
        onPress={() => nav.push('alarms')}
      />

      <SectionLabel>Safety</SectionLabel>

      <FeatureCard
        icon="↩"
        title={busy === 'restore' ? 'Restoring…' : 'Restore all names'}
        subtitle="Put every original name back, keeping your slots"
        tone="danger"
        disabled={busy !== null || groups.length === 0}
        onPress={() => setConfirmRestore(true)}
      />

      <Text style={styles.footnote}>
        Names are written to your device's contact store. If the contact belongs
        to a synced account (such as Google), the new name syncs to that account
        too. Run “Restore all names” before uninstalling — the backup lives
        inside this app.
      </Text>

      <ConfirmDialog
        visible={confirmRestore}
        destructive
        busy={busy === 'restore'}
        title="Restore every contact?"
        message="Each tracked contact goes back to the name it had before Persona changed it. Your time slots are kept, so schedules will apply again at their next start time."
        confirmLabel="Restore all"
        onConfirm={doRestoreAll}
        onCancel={() => setConfirmRestore(false)}
      />

      <ConfirmDialog
        visible={restoreResult !== null}
        title="Done"
        message={restoreResult ?? ''}
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setRestoreResult(null)}
        onCancel={() => setRestoreResult(null)}
      />

      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(contact: Contact) => {
          setPickerVisible(false);
          nav.push('contact', {
            phoneRaw: contact.phoneRaw,
            displayName: contact.displayName,
            openEditor: true,
          });
        }}
      />
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  ({
    screen: {flex: 1, backgroundColor: 'transparent'},
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
      gap: spacing.md,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    spacer: {flex: 1},
    gear: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: `0 0 16px ${c.glow}`,
    },
    gearPressed: {backgroundColor: c.surfaceAlt},
    gearIcon: {color: c.text, fontSize: 18, marginTop: -1},

    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    cardWarning: {borderColor: c.warning},
    cardTitle: {color: c.text, fontSize: 17, fontWeight: '700'},
    paragraph: {color: c.textMuted, fontSize: 14, lineHeight: 20},
    primaryButton: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    primaryButtonText: {color: c.accentText, fontWeight: '700', fontSize: 15},

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.accent,
      backgroundImage:
        'linear-gradient(110deg, #2f7bff 0%, #4f8cff 45%, #6aa0ff 100%)',
      borderRadius: radius.xl,
      padding: spacing.lg,
    },
    heroPressed: {opacity: 0.9},
    heroDisabled: {opacity: 0.5},
    heroPlus: {
      width: 52,
      height: 52,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.lg,
    },
    heroPlusText: {
      color: '#fff',
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '300',
      marginTop: -2,
    },
    heroText: {flex: 1},
    heroTitle: {color: '#fff', fontSize: 20, fontWeight: '800'},
    heroSubtitle: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 13,
      marginTop: 3,
      lineHeight: 18,
    },

    statCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      boxShadow: `0 0 20px ${c.glow}`,
    },
    statItem: {alignItems: 'flex-start'},
    statItemWide: {flex: 1, alignItems: 'flex-end'},
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: c.border,
      marginHorizontal: spacing.lg,
    },
    statValue: {color: c.text, fontSize: 17, fontWeight: '700'},
    statLabel: {color: c.textMuted, fontSize: 11, marginTop: 2},

    footnote: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: spacing.lg,
    },
  }) as const;
