import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export type Contact = {
  contactId: number;
  displayName: string;
  /** The number exactly as stored on the device. */
  phoneRaw: string;
  /** Digits-only key used by the scheduler. */
  phone: string;
  writableRawContacts: number;
};

export type Schedule = {
  id: number;
  phone: string;
  phoneRaw: string;
  displayName: string;
  /** Minutes from midnight, 0-1439. */
  startMinutes: number;
  endMinutes: number;
  /** 7-bit day set, bit 0 = Sunday. See `src/time.ts`. */
  daysMask: number;
  enabled: boolean;
  /** The name the contact had before this app touched it. */
  originalName: string | null;
};

/** What triggered a recorded rename. */
export type HistorySource = 'alarm' | 'manual' | 'boot' | 'restore';

export type HistoryEntry = {
  id: number;
  phoneRaw: string;
  fromName: string;
  toName: string;
  source: HistorySource;
  changedAt: number;
};

export type AppVersion = {
  versionCode: number;
  versionName: string;
  /** Whether Android will let this app hand an APK to the installer. */
  canInstall: boolean;
};

export type RestoreFromFileResult = {
  found: number;
  restored: number;
  failed: number;
};

export type NotificationSettings = {
  enabled: boolean;
  permissionGranted: boolean;
  /** Android 13+ needs a runtime grant before anything can be posted. */
  requiresGrant: boolean;
};

export type Backup = {
  phone: string;
  phoneRaw: string;
  originalName: string;
  appliedName: string | null;
};

export type ApplyResult = {
  changed: number;
  skipped: number;
  failed: number;
  nextRunAt: number | null;
};

export type PermissionStatus = {
  contacts: boolean;
  exactAlarm: boolean;
  exactAlarmRequiresGrant: boolean;
};

export type Status = {
  scheduleCount: number;
  trackedContacts: number;
  backupCount: number;
  exactAlarmAllowed: boolean;
  nextRunAt: number | null;
};

type ContactModuleSpec = {
  getPermissionStatus(): Promise<PermissionStatus>;
  openExactAlarmSettings(): Promise<boolean>;
  listContacts(query: string, limit: number): Promise<Contact[]>;
  findContactByPhone(phone: string): Promise<Contact | null>;
  getSchedules(): Promise<Schedule[]>;
  saveSchedule(input: {
    id?: number;
    phoneRaw: string;
    displayName: string;
    startMinutes: number;
    endMinutes: number;
    daysMask?: number;
    enabled?: boolean;
  }): Promise<ApplyResult>;
  deleteSchedule(id: number): Promise<ApplyResult>;
  deleteContactSchedules(phoneRaw: string): Promise<ApplyResult>;
  applyNow(): Promise<ApplyResult>;
  restoreAll(): Promise<ApplyResult>;
  forgetContact(phoneRaw: string): Promise<boolean>;
  getStatus(): Promise<Status>;
  getBackups(): Promise<Backup[]>;
  getHistory(limit: number): Promise<HistoryEntry[]>;
  clearHistory(): Promise<boolean>;
  /** Mirrors the saved original names to a file outside app storage. */
  exportBackupFile(): Promise<boolean>;
  /**
   * Opens the system file picker and restores from the chosen backup.
   * Resolves with null when the user backs out.
   */
  restoreFromBackupFile(): Promise<RestoreFromFileResult | null>;
  getAppVersion(): Promise<AppVersion>;
  /** Returns the manifest body as text, to be parsed by the caller. */
  fetchUpdateManifest(url: string): Promise<string>;
  /** Downloads the APK and resolves with its local path. */
  downloadUpdate(url: string, fileName: string): Promise<string>;
  /** False when Android first needs the install-unknown-apps grant. */
  installUpdate(path: string): Promise<boolean>;
  isBatteryUnrestricted(): Promise<boolean>;
  /** Shows the system's one-tap dialog. False if no screen could be opened. */
  requestBatteryUnrestricted(): Promise<boolean>;
  getPreference(key: string, fallback: string): Promise<string>;
  setPreference(key: string, value: string): Promise<boolean>;
  getNotificationSettings(): Promise<NotificationSettings>;
  setNotificationsEnabled(enabled: boolean): Promise<boolean>;
  /**
   * Opens the platform clock dialog. Resolves with minutes past midnight, or
   * null when the user dismissed it.
   */
  pickTime(initialMinutes: number): Promise<number | null>;
};

const LINKING_ERROR =
  'ContactModule is not available. Rebuild the Android app (npm run android) ' +
  'after adding the native module — a Metro reload is not enough.';

export const ContactNames: ContactModuleSpec = new Proxy({} as ContactModuleSpec, {
  get(_target, name: string) {
    const nativeModule = NativeModules.ContactModule;
    if (!nativeModule) {
      return () => Promise.reject(new Error(LINKING_ERROR));
    }
    return nativeModule[name];
  },
});

export const isNativeModuleAvailable = (): boolean =>
  Platform.OS === 'android' && Boolean(NativeModules.ContactModule);

/**
 * Asks for READ_CONTACTS and WRITE_CONTACTS. Exact-alarm access is not a
 * runtime permission — it is a Settings toggle — so it is handled separately.
 */
export async function requestContactsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
    PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
  ]);
  return (
    result[PermissionsAndroid.PERMISSIONS.READ_CONTACTS] === 'granted' &&
    result[PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS] === 'granted'
  );
}

/**
 * POST_NOTIFICATIONS became a runtime permission in Android 13. Older
 * versions grant it at install time, so there is nothing to ask for.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return true;
  }
  const result = await PermissionsAndroid.request(
    'android.permission.POST_NOTIFICATIONS' as Parameters<
      typeof PermissionsAndroid.request
    >[0],
  );
  return result === 'granted';
}
