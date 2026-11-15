import React from 'react';
import {Alert, RefreshControl, ScrollView, Text, View} from 'react-native';

import {ErrorBanner, GlowPill} from '../components/ui';
import {ContactNames, HistorySource} from '../native/ContactNames';
import {useAppData} from '../state/AppData';
import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';
import {minutesToLabel12h} from '../time';

const SOURCE_LABEL: Record<HistorySource, string> = {
  alarm: 'on schedule',
  manual: 'applied by you',
  boot: 'after restart',
  restore: 'restored',
};

export function HistoryScreen() {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const {history, loading, error, refresh, runAction, busy} = useAppData();

  const confirmClear = () => {
    Alert.alert(
      'Clear history?',
      'The log of past name changes is deleted. Contacts and schedules are untouched.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => runAction('history', () => ContactNames.clearHistory()),
        },
      ],
    );
  };

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

      {history.length === 0 ? (
        <Text style={styles.empty}>
          No name changes recorded yet. Every automatic and manual rename shows
          up here, newest first.
        </Text>
      ) : (
        <>
          <Text style={styles.count}>
            {history.length} change{history.length === 1 ? '' : 's'}
          </Text>
          <View style={styles.card}>
            {history.map((entry, index) => (
              <View
                key={entry.id}
                style={[styles.row, index > 0 && styles.rowDivided]}>
                <View style={styles.dot} />
                <View style={styles.rowText}>
                  <Text style={styles.names} numberOfLines={1}>
                    <Text style={styles.from}>{entry.fromName}</Text>
                    {'  →  '}
                    <Text style={styles.to}>{entry.toName}</Text>
                  </Text>
                  <Text style={styles.meta}>
                    {formatWhen(entry.changedAt)} ·{' '}
                    {SOURCE_LABEL[entry.source] ?? entry.source}
                  </Text>
                  <Text style={styles.number}>{entry.phoneRaw}</Text>
                </View>
              </View>
            ))}
          </View>

          <GlowPill
            label="Clear history"
            tone="danger"
            disabled={busy !== null}
            onPress={confirmClear}
          />
        </>
      )}
    </ScrollView>
  );
}

/** "today at 1:00 PM" / "Mon, 14 Nov at 1:00 PM" — enough to place a change. */
function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  const time = minutesToLabel12h(date.getHours() * 60 + date.getMinutes());
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const daysAgo = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000,
  );

  if (daysAgo === 0) {
    return `today at ${time}`;
  }
  if (daysAgo === 1) {
    return `yesterday at ${time}`;
  }
  const stamp = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${stamp} at ${time}`;
}

const makeStyles = (c: Colors) =>
  ({
    screen: {flex: 1, backgroundColor: 'transparent'},
    content: {padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md},
    empty: {color: c.textMuted, lineHeight: 20, marginTop: spacing.lg},
    count: {color: c.textMuted, fontSize: 13},
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.lg,
      boxShadow: `0 0 20px ${c.glow}`,
    },
    row: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.md},
    rowDivided: {borderTopWidth: 1, borderTopColor: c.border},
    dot: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
      marginTop: 6,
      marginRight: spacing.md,
    },
    rowText: {flex: 1},
    names: {fontSize: 15},
    from: {color: c.textMuted, textDecorationLine: 'line-through'},
    to: {color: c.text, fontWeight: '700'},
    meta: {color: c.textMuted, fontSize: 12, marginTop: 3},
    number: {color: c.textMuted, fontSize: 11, marginTop: 1},
    clearButton: {paddingVertical: spacing.md, alignItems: 'center'},
    clearText: {color: c.danger, fontWeight: '600', fontSize: 14},
  }) as const;
