import React, {useCallback, useEffect, useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import {Contact, ContactNames} from '../native/ContactNames';
import {Ambient} from './Ambient';
import {ContactSkeleton} from './Skeleton';
import {Avatar, Badge} from './ui';
import {Colors, radius, spacing, useColors, useThemedStyles} from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: Contact) => void;
};

/** Searchable list of device contacts that have a phone number. */
export function ContactPickerModal({visible, onClose, onSelect}: Props) {
  const styles = useThemedStyles(makeStyles);
  const palette = useColors();
  const Separator = useCallback(
    () => <View style={styles.gap} />,
    [styles],
  );
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  /** False until the first result set has landed, which is when we skeleton. */
  const [primed, setPrimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const found = await ContactNames.listContacts(search, 200);
      setContacts(found);
      setPrimed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setPrimed(false);
      return;
    }
    // Debounced so typing does not fire a provider query per keystroke.
    const handle = setTimeout(() => load(query), query ? 120 : 0);
    return () => clearTimeout(handle);
  }, [visible, query, load]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Ambient>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose a contact</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({pressed}) => [
              styles.closePill,
              {boxShadow: `0 0 18px ${palette.glow}`},
              pressed && styles.closePressed,
            ]}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or number"
          placeholderTextColor={palette.textMuted}
          autoCorrect={false}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!primed ? (
          <View style={styles.list}>
            <ContactSkeleton />
          </View>
        ) : (
          <FlatList
            showsVerticalScrollIndicator={false}
            // Refining a search dims the old results rather than clearing
            // them, so the list never flashes empty between keystrokes.
            style={loading ? styles.listRefreshing : undefined}
            data={contacts}
            keyExtractor={item => `${item.contactId}-${item.phone}`}
            ItemSeparatorComponent={Separator}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query ? 'No contact matches that search.' : 'No contacts with a phone number.'}
              </Text>
            }
            renderItem={({item}) => {
              const editable = item.writableRawContacts > 0;
              return (
                <Pressable
                  style={({pressed}) => [
                    styles.row,
                    {boxShadow: `0 0 16px ${palette.glow}`},
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}>
                  <Avatar name={item.displayName} size={42} tinted />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                    <Text style={styles.number} numberOfLines={1}>
                      {item.phoneRaw}
                    </Text>
                  </View>
                  <Badge
                    label={editable ? 'Editable' : 'Read-only'}
                    tone={editable ? 'positive' : 'neutral'}
                  />
                </Pressable>
              );
            }}
          />
        )}
      </View>
      </Ambient>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  ({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      // Clears the status bar, which the modal draws under.
      paddingTop: spacing.xl * 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    title: {color: c.text, fontSize: 24, fontWeight: '800'},
    closePill: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.accentMuted,
      borderWidth: 1,
      borderColor: c.accent,
    },
    closePressed: {opacity: 0.75},
    close: {color: c.accent, fontSize: 15, fontWeight: '700'},
    search: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      fontSize: 15,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    list: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
    listRefreshing: {opacity: 0.55},
    loader: {marginTop: spacing.xl},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    rowPressed: {backgroundColor: c.surfaceAlt},
    rowText: {flex: 1, marginHorizontal: spacing.md},
    name: {color: c.text, fontSize: 16, fontWeight: '700'},
    number: {color: c.textMuted, fontSize: 13, marginTop: 2},
    gap: {height: spacing.sm},
    empty: {color: c.textMuted, textAlign: 'center', marginTop: spacing.xl},
    error: {
      color: c.danger,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
  }) as const;
