import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {AppState, LayoutAnimation} from 'react-native';

import {useUpdates, UpdateState} from './useUpdates';
import {
  Backup,
  ContactNames,
  HistoryEntry,
  NotificationSettings,
  PermissionStatus,
  Schedule,
  Status,
  isNativeModuleAvailable,
} from '../native/ContactNames';

const HISTORY_FETCH = 100;

/** One managed number with the slots that belong to it. */
export type Group = {
  phone: string;
  phoneRaw: string;
  originalName: string;
  appliedName: string | null;
  slots: Schedule[];
};

type AppDataValue = {
  permissions: PermissionStatus | null;
  status: Status | null;
  groups: Group[];
  history: HistoryEntry[];
  notifications: NotificationSettings | null;
  /** True once Android stops deferring this app's background work. */
  batteryUnrestricted: boolean;
  loading: boolean;
  busy: string | null;
  error: string | null;
  moduleMissing: boolean;
  updates: UpdateState;
  refresh: () => Promise<void>;
  /** Runs a native action, then refreshes; errors land in `error`. */
  runAction: (key: string, action: () => Promise<unknown>) => Promise<void>;
  clearError: () => void;
};

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({children}: {children: React.ReactNode}) {
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [notifications, setNotifications] =
    useState<NotificationSettings | null>(null);
  const [batteryUnrestricted, setBatteryUnrestricted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const moduleMissing = !isNativeModuleAvailable();
  const updates = useUpdates();

  const refresh = useCallback(async () => {
    if (moduleMissing) {
      setError(
        'The native module is not linked. Run "npm run android" to rebuild the app.',
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const perms = await ContactNames.getPermissionStatus();
      setPermissions(perms);
      setStatus(await ContactNames.getStatus());
      setNotifications(await ContactNames.getNotificationSettings());
      setBatteryUnrestricted(await ContactNames.isBatteryUnrestricted());
      if (perms.contacts) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSchedules(await ContactNames.getSchedules());
        setBackups(await ContactNames.getBackups());
        setHistory(await ContactNames.getHistory(HISTORY_FETCH));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [moduleMissing]);

  useEffect(() => {
    refresh();
    // Permissions and the exact-alarm toggle can change while we are in
    // Settings, and a slot may have fired while the app was backgrounded.
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await action();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const groups = useMemo<Group[]>(() => {
    const byPhone = new Map<string, Group>();
    for (const backup of backups) {
      byPhone.set(backup.phone, {
        phone: backup.phone,
        phoneRaw: backup.phoneRaw,
        originalName: backup.originalName,
        appliedName: backup.appliedName,
        slots: [],
      });
    }
    for (const slot of schedules) {
      const existing = byPhone.get(slot.phone);
      if (existing) {
        existing.slots.push(slot);
      } else {
        byPhone.set(slot.phone, {
          phone: slot.phone,
          phoneRaw: slot.phoneRaw,
          originalName: slot.originalName ?? slot.phoneRaw,
          appliedName: null,
          slots: [slot],
        });
      }
    }
    return Array.from(byPhone.values()).map(group => ({
      ...group,
      slots: [...group.slots].sort((a, b) => a.startMinutes - b.startMinutes),
    }));
  }, [backups, schedules]);

  const value = useMemo<AppDataValue>(
    () => ({
      permissions,
      status,
      groups,
      history,
      notifications,
      batteryUnrestricted,
      loading,
      busy,
      error,
      moduleMissing,
      updates,
      refresh,
      runAction,
      clearError: () => setError(null),
    }),
    [
      permissions,
      status,
      groups,
      history,
      notifications,
      batteryUnrestricted,
      loading,
      busy,
      error,
      moduleMissing,
      updates,
      refresh,
      runAction,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext);
  if (!value) {
    throw new Error('useAppData must be used inside an AppDataProvider');
  }
  return value;
}
