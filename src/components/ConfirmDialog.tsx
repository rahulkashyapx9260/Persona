import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Modal, Pressable, Text, View} from 'react-native';

import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  /** Shown on the confirming button; the wording should name the action. */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive styling for anything that rewrites or deletes. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The app's own confirmation sheet.
 *
 * Android's stock Alert ignores the theme entirely, so a destructive
 * confirmation used to arrive as a grey system box in the middle of a dark,
 * glowing app. This matches everything around it, and keeps the confirming
 * action on the right where the eye already expects it.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, enter]);

  const accent = destructive ? palette.danger : palette.accent;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onCancel}>
      {/* Tapping outside cancels, which is what a stock dialog does too. */}
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel}>
        <Animated.View
          style={[
            styles.sheet,
            {
              boxShadow: `0 0 34px ${palette.glow}`,
              opacity: enter,
              transform: [
                {
                  scale: enter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                },
              ],
            },
          ]}>
          {/* Swallows taps so a press inside does not dismiss. */}
          <Pressable>
            <View style={[styles.accentBar, {backgroundColor: accent}]} />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            <View style={styles.actions}>
              <Pressable
                disabled={busy}
                onPress={onCancel}
                style={({pressed}) => [
                  styles.button,
                  styles.cancel,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={onConfirm}
                style={({pressed}) => [
                  styles.button,
                  styles.confirm,
                  {backgroundColor: accent},
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}>
                <Text style={styles.confirmText}>
                  {busy ? 'Working…' : confirmLabel}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  ({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    sheet: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    accentBar: {
      width: 38,
      height: 4,
      borderRadius: radius.pill,
      marginBottom: spacing.lg,
    },
    title: {color: c.text, fontSize: 20, fontWeight: '800', lineHeight: 27},
    message: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginTop: spacing.sm,
    },
    actions: {flexDirection: 'row', marginTop: spacing.xl},
    button: {
      flex: 1,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    cancel: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      marginRight: spacing.sm,
    },
    cancelText: {color: c.text, fontSize: 15, fontWeight: '600'},
    confirm: {marginLeft: spacing.sm},
    confirmText: {color: '#fff', fontSize: 15, fontWeight: '700'},
    pressed: {opacity: 0.85},
    disabled: {opacity: 0.6},
  }) as const;
