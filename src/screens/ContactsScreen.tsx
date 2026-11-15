import React from 'react';
import {Pressable, RefreshControl, ScrollView, Text, View} from 'react-native';

import {Avatar, ErrorBanner} from '../components/ui';
import {useNavigation} from '../navigation/Navigator';
import {useAppData} from '../state/AppData';
import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';
import {isActiveOn, nowMinutes, today} from '../time';
import type {ScreenName} from './routes';

/** The list of numbers this app is managing. One tap opens its schedule. */
export function ContactsScreen() {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const nav = useNavigation<ScreenName>();
  const {groups, loading, error, refresh} = useAppData();

  const minutes = nowMinutes();
  const dayIndex = today();

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
      <ErrorBanner message={error} />

      {groups.length === 0 ? (
        <Text style={styles.empty}>
          No contacts are being managed yet. Go back and tap “Add a contact”.
        </Text>
      ) : null}

      {groups.map(group => {
        const active = group.slots.find(
          slot =>
            slot.enabled &&
            isActiveOn(
              slot.startMinutes,
              slot.endMinutes,
              slot.daysMask,
              minutes,
              dayIndex,
            ),
        );
        return (
          <Pressable
            key={group.phone}
            accessibilityRole="button"
            onPress={() =>
              nav.push('contact', {
                phoneRaw: group.phoneRaw,
                displayName: group.originalName,
              })
            }
            style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
            <Avatar
              name={active?.displayName ?? group.originalName}
              active={Boolean(active)}
            />
            <View style={styles.rowText}>
              <Text style={styles.name}>{group.originalName}</Text>
              <Text style={styles.number}>{group.phoneRaw}</Text>
              <Text style={[styles.showing, active && styles.showingActive]}>
                {active
                  ? `Showing now: ${active.displayName}`
                  : 'Showing the original name'}
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{group.slots.length}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  ({
    screen: {flex: 1, backgroundColor: 'transparent'},
    content: {padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md},
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xl,
      lineHeight: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      boxShadow: `0 0 20px ${c.glow}`,
    },
    rowPressed: {backgroundColor: c.surfaceAlt},
    rowText: {flex: 1, marginLeft: spacing.md},
    name: {color: c.text, fontSize: 16, fontWeight: '700'},
    number: {color: c.textMuted, fontSize: 13, marginTop: 1},
    showing: {color: c.textMuted, fontSize: 12, marginTop: 4},
    showingActive: {color: c.success, fontWeight: '600'},
    countPill: {
      minWidth: 26,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    countText: {color: c.textMuted, fontSize: 12, fontWeight: '700'},
    chevron: {color: c.textMuted, fontSize: 22, marginTop: -2},
  }) as const;
