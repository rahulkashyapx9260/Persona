import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';

import {ConfirmDialog} from '../components/ConfirmDialog';
import {SlotEditorModal} from '../components/SlotEditorModal';
import {Avatar, ErrorBanner} from '../components/ui';
import {useNavigation, useRouteParams} from '../navigation/Navigator';
import {ContactNames, Schedule} from '../native/ContactNames';
import {useAppData} from '../state/AppData';
import {Colors, radius, spacing, useThemedStyles} from '../theme';
import {daysLabel, isActiveOn, minutesToLabel12h, nowMinutes, today} from '../time';
import type {ContactParams, ScreenName} from './routes';

/** Everything about one number: its slots, and the actions that touch it. */
export function ContactDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const nav = useNavigation<ScreenName>();
  const params = useRouteParams<ContactParams>();
  const {groups, busy, error, runAction} = useAppData();

  const group = useMemo(
    () => groups.find(g => g.phoneRaw === params.phoneRaw),
    [groups, params.phoneRaw],
  );

  const [editor, setEditor] = useState<{schedule: Schedule | null} | null>(
    // Coming straight from the picker, the first slot editor opens itself.
    params.openEditor ? {schedule: null} : null,
  );

  // Once the contact is removed there is nothing left to show.
  useEffect(() => {
    if (!group && !params.openEditor) {
      nav.pop();
    }
  }, [group, params.openEditor, nav]);

  const label = group?.originalName ?? params.displayName;
  const minutes = nowMinutes();
  const dayIndex = today();

  const activeSlot = group?.slots.find(
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

  const [confirmForget, setConfirmForget] = useState(false);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);

  const doForget = async () => {
    if (!group) {
      return;
    }
    await runAction(`forget-${group.phone}`, () =>
      ContactNames.forgetContact(group.phoneRaw),
    );
    setConfirmForget(false);
    nav.pop();
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <ErrorBanner message={error} />

      <View style={styles.header}>
        <Avatar
          name={activeSlot?.displayName ?? label}
          active={Boolean(activeSlot)}
          size={56}
        />
        <View style={styles.headerText}>
          <Text style={styles.name}>{label}</Text>
          <Text style={styles.number}>{params.phoneRaw}</Text>
        </View>
      </View>

      <View style={[styles.pill, activeSlot && styles.pillActive]}>
        <Text style={styles.pillText}>
          Showing now: {activeSlot ? activeSlot.displayName : label}
          {activeSlot ? '' : ' (original)'}
        </Text>
      </View>

      {group && group.slots.length === 0 ? (
        <Text style={styles.empty}>
          No time slots yet. Add one such as 13:00–15:00 → “Rahul”.
        </Text>
      ) : null}

      {group?.slots.map(slot => {
        const isActive = Boolean(activeSlot && activeSlot.id === slot.id);
        return (
          <Pressable
            key={slot.id}
            style={({pressed}) => [
              styles.slot,
              isActive && styles.slotActive,
              pressed && styles.slotPressed,
            ]}
            onPress={() => setEditor({schedule: slot})}>
            <View style={styles.slotText}>
              <Text style={styles.slotName}>{slot.displayName}</Text>
              <Text style={styles.slotTime}>
                {minutesToLabel12h(slot.startMinutes)} –{' '}
                {minutesToLabel12h(slot.endMinutes)}
                {slot.enabled ? '' : ' · paused'}
              </Text>
              <Text style={styles.slotDays}>{daysLabel(slot.daysMask)}</Text>
            </View>
            <Pressable
              hitSlop={10}
              disabled={busy !== null}
              onPress={() =>
                runAction(`delete-${slot.id}`, () =>
                  ContactNames.deleteSchedule(slot.id),
                )
              }>
              <Text style={styles.deleteLink}>Delete</Text>
            </Pressable>
          </Pressable>
        );
      })}

      <Pressable
        style={styles.addButton}
        onPress={() => setEditor({schedule: null})}>
        <Text style={styles.addButtonText}>+ Add time slot</Text>
      </Pressable>

      {group ? (
        <Pressable style={styles.removeButton} onPress={() => setConfirmForget(true)}>
          <Text style={styles.removeButtonText}>
            Stop managing this contact
          </Text>
        </Pressable>
      ) : null}

      <ConfirmDialog
        visible={confirmForget}
        destructive
        busy={busy !== null}
        title={`Stop managing ${label}?`}
        message="The contact is renamed back to its original name and all of its time slots are deleted. This cannot be undone."
        confirmLabel="Stop managing"
        onConfirm={doForget}
        onCancel={() => setConfirmForget(false)}
      />

      <SlotEditorModal
        visible={editor !== null}
        phoneRaw={params.phoneRaw}
        contactLabel={`${label} · ${params.phoneRaw}`}
        schedule={editor?.schedule ?? null}
        onClose={() => setEditor(null)}
        onSaved={setSavedSummary}
      />

      <ConfirmDialog
        visible={savedSummary !== null}
        title="Slot saved"
        message={savedSummary ?? ''}
        confirmLabel="Got it"
        cancelLabel="Close"
        onConfirm={() => setSavedSummary(null)}
        onCancel={() => setSavedSummary(null)}
      />
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  ({
    screen: {flex: 1, backgroundColor: 'transparent'},
    content: {padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md},
    header: {flexDirection: 'row', alignItems: 'center'},
    headerText: {flex: 1, marginLeft: spacing.md},
    name: {color: c.text, fontSize: 20, fontWeight: '800'},
    number: {color: c.textMuted, fontSize: 14, marginTop: 2},
    pill: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    pillActive: {backgroundColor: c.accentMuted},
    pillText: {color: c.text, fontSize: 13, fontWeight: '600'},
    empty: {color: c.textMuted, lineHeight: 20, marginTop: spacing.sm},
    slot: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      borderLeftWidth: 3,
      borderLeftColor: c.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    slotActive: {borderLeftColor: c.success},
    slotPressed: {backgroundColor: c.surfaceAlt},
    slotText: {flex: 1},
    slotName: {color: c.text, fontSize: 16, fontWeight: '700'},
    slotTime: {color: c.textMuted, fontSize: 13, marginTop: 2},
    slotDays: {color: c.accent, fontSize: 12, marginTop: 2, fontWeight: '600'},
    deleteLink: {color: c.danger, fontSize: 13, fontWeight: '600'},
    addButton: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.accent,
      borderStyle: 'dashed',
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    addButtonText: {color: c.accent, fontWeight: '700', fontSize: 15},
    removeButton: {
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    removeButtonText: {color: c.danger, fontWeight: '600', fontSize: 14},
  }) as const;
