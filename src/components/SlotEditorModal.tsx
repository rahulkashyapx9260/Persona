import React, {useCallback, useEffect, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {ContactNames, Schedule} from '../native/ContactNames';
import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';
import {
  ALL_DAYS,
  DAY_LABELS,
  WEEKDAYS,
  WEEKEND,
  dayCount,
  daysLabel,
  minutesToLabel12h,
  runsOn,
  toggleDay,
} from '../time';

type Props = {
  visible: boolean;
  /** The number the slot belongs to, and a label for the header. */
  phoneRaw: string;
  contactLabel: string;
  /** Existing slot to edit, or null to create one. */
  schedule: Schedule | null;
  onClose: () => void;
  onSaved: () => void;
};

const PRESETS: Array<{label: string; mask: number}> = [
  {label: 'Every day', mask: ALL_DAYS},
  {label: 'Weekdays', mask: WEEKDAYS},
  {label: 'Weekends', mask: WEEKEND},
];

export function SlotEditorModal({
  visible,
  phoneRaw,
  contactLabel,
  schedule,
  onClose,
  onSaved,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();

  const [displayName, setDisplayName] = useState('');
  const [start, setStart] = useState(13 * 60);
  const [end, setEnd] = useState(15 * 60);
  const [daysMask, setDaysMask] = useState(ALL_DAYS);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setError(null);
    setDisplayName(schedule?.displayName ?? '');
    setStart(schedule?.startMinutes ?? 13 * 60);
    setEnd(schedule?.endMinutes ?? 15 * 60);
    setDaysMask(schedule?.daysMask ?? ALL_DAYS);
    setEnabled(schedule?.enabled ?? true);
  }, [visible, schedule]);

  const overnight = start > end;

  // The platform clock dialog replaces free-text entry, so a time can no
  // longer be invalid — only the day set and the name still need checking.
  const pick = useCallback(
    async (which: 'start' | 'end') => {
      try {
        const current = which === 'start' ? start : end;
        const picked = await ContactNames.pickTime(current);
        if (picked == null) {
          return;
        }
        if (which === 'start') {
          setStart(picked);
        } else {
          setEnd(picked);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [start, end],
  );

  const save = async () => {
    setError(null);
    if (!displayName.trim()) {
      setError('Enter the name to show during this slot.');
      return;
    }
    if (dayCount(daysMask) === 0) {
      setError('Pick at least one day.');
      return;
    }
    if (start === end) {
      setError('Start and end time cannot be the same.');
      return;
    }
    setSaving(true);
    try {
      await ContactNames.saveSchedule({
        id: schedule?.id,
        phoneRaw,
        displayName: displayName.trim(),
        startMinutes: start,
        endMinutes: end,
        daysMask,
        enabled,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior="padding"
        // A transparent Modal does not get the activity's adjustResize, so the
        // sheet is lifted manually. The window spans the status bar here, so
        // that height is subtracted back out.
        keyboardVerticalOffset={-(StatusBar.currentHeight ?? 0)}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={styles.sheetContent}>
            <Text style={styles.title}>
              {schedule ? 'Edit time slot' : 'New time slot'}
            </Text>
            <Text style={styles.subtitle}>{contactLabel}</Text>

            <Text style={styles.label}>Show this name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Rahul"
              placeholderTextColor={palette.textMuted}
              autoCapitalize="words"
            />

            <View style={styles.timeRow}>
              <TimeField
                styles={styles}
                label="From"
                minutes={start}
                onPress={() => pick('start')}
              />
              <View style={styles.arrowWrap}>
                <Text style={styles.arrow}>→</Text>
              </View>
              <TimeField
                styles={styles}
                label="To"
                minutes={end}
                onPress={() => pick('end')}
              />
            </View>

            {overnight ? (
              <Text style={styles.note}>
                Runs past midnight into the next morning.
              </Text>
            ) : null}

            <Text style={[styles.label, styles.sectionLabel]}>
              Repeat on · {daysLabel(daysMask)}
            </Text>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((letter, index) => {
                const on = runsOn(daysMask, index);
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="checkbox"
                    accessibilityState={{checked: on}}
                    style={[styles.dayChip, on && styles.dayChipOn]}
                    onPress={() => setDaysMask(toggleDay(daysMask, index))}>
                    <Text style={[styles.dayText, on && styles.dayTextOn]}>
                      {letter}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.presetRow}>
              {PRESETS.map(preset => (
                <Pressable
                  key={preset.label}
                  style={[
                    styles.preset,
                    daysMask === preset.mask && styles.presetOn,
                  ]}
                  onPress={() => setDaysMask(preset.mask)}>
                  <Text
                    style={[
                      styles.presetText,
                      daysMask === preset.mask && styles.presetTextOn,
                    ]}>
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>Active</Text>
                <Text style={styles.switchHint}>
                  Turn off to keep the slot without applying it.
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{true: palette.accentMuted, false: palette.border}}
                thumbColor={enabled ? palette.accent : palette.textMuted}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.buttonGhost]}
                onPress={onClose}>
                <Text style={styles.buttonGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  styles.buttonPrimary,
                  saving && styles.buttonDisabled,
                ]}
                disabled={saving}
                onPress={save}>
                <Text style={styles.buttonPrimaryText}>
                  {saving ? 'Saving…' : 'Save slot'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TimeField({
  styles,
  label,
  minutes,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  minutes: number;
  onPress: () => void;
}) {
  return (
    <View style={styles.timeField}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${minutesToLabel12h(minutes)}`}
        style={styles.timeButton}
        onPress={onPress}>
        <Text style={styles.timeValue}>{minutesToLabel12h(minutes)}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  ({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      maxHeight: '92%',
    },
    sheetContent: {paddingBottom: spacing.md},
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: c.border,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    title: {color: c.text, fontSize: 20, fontWeight: '700'},
    subtitle: {
      color: c.textMuted,
      fontSize: 14,
      marginTop: 2,
      marginBottom: spacing.lg,
    },
    label: {color: c.textMuted, fontSize: 13, marginBottom: spacing.xs},
    sectionLabel: {marginTop: spacing.lg},
    input: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 16,
    },
    timeRow: {flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg},
    timeField: {flex: 1},
    timeButton: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    timeValue: {color: c.text, fontSize: 18, fontWeight: '600'},
    arrowWrap: {paddingHorizontal: spacing.sm, paddingBottom: spacing.md},
    arrow: {color: c.textMuted, fontSize: 16},
    note: {color: c.warning, fontSize: 13, marginTop: spacing.md},
    dayRow: {flexDirection: 'row', justifyContent: 'space-between'},
    dayChip: {
      flex: 1,
      marginHorizontal: 3,
      aspectRatio: 1,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayChipOn: {backgroundColor: c.accent, borderColor: c.accent},
    dayText: {color: c.textMuted, fontSize: 14, fontWeight: '600'},
    dayTextOn: {color: c.accentText},
    presetRow: {flexDirection: 'row', marginTop: spacing.md},
    preset: {
      marginRight: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
    },
    presetOn: {backgroundColor: c.accentMuted, borderColor: c.accent},
    presetText: {color: c.textMuted, fontSize: 13, fontWeight: '600'},
    presetTextOn: {color: c.accent},
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xl,
    },
    switchText: {flex: 1, paddingRight: spacing.md},
    switchTitle: {color: c.text, fontSize: 15, fontWeight: '600'},
    switchHint: {color: c.textMuted, fontSize: 12, marginTop: 2},
    error: {color: c.danger, marginTop: spacing.md, fontSize: 14},
    actions: {flexDirection: 'row', marginTop: spacing.xl},
    button: {
      flex: 1,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonPrimary: {backgroundColor: c.accent, marginLeft: spacing.sm},
    buttonPrimaryText: {color: c.accentText, fontWeight: '700', fontSize: 16},
    buttonGhost: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: spacing.sm,
    },
    buttonGhostText: {color: c.text, fontWeight: '600', fontSize: 16},
    buttonDisabled: {opacity: 0.6},
  }) as const;
