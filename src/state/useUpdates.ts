import {useCallback, useEffect, useState} from 'react';

import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_MANIFEST_URL,
  updatesConfigured,
} from '../config';
import {AppVersion, ContactNames, isNativeModuleAvailable} from '../native/ContactNames';

/** The shape of the JSON the app fetches to learn about newer builds. */
export type UpdateManifest = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes?: string;
};

export type UpdateState = {
  /** Null while unknown, or when updates are not configured. */
  available: UpdateManifest | null;
  current: AppVersion | null;
  checking: boolean;
  /** True while the browser is being opened. */
  downloading: boolean;
  error: string | null;
  check: (force?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
};

const LAST_CHECK_KEY = 'update_last_check';
const SKIPPED_KEY = 'update_skipped_code';

/**
 * Checks a JSON manifest for a newer build and installs it on request.
 *
 * Sideloaded apps get no store updates, so this is the only path from one
 * version to the next. The install is always confirmed by the user through
 * Android's own installer — nothing happens silently.
 */
export function useUpdates(): UpdateState {
  const [available, setAvailable] = useState<UpdateManifest | null>(null);
  const [current, setCurrent] = useState<AppVersion | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = updatesConfigured() && isNativeModuleAvailable();

  const check = useCallback(
    async (force = false) => {
      if (!enabled) {
        return;
      }
      setChecking(true);
      setError(null);
      try {
        const version = await ContactNames.getAppVersion();
        setCurrent(version);

        if (!force) {
          // Checking on every launch wastes the user's data for no gain.
          const last = Number(
            await ContactNames.getPreference(LAST_CHECK_KEY, '0'),
          );
          if (Date.now() - last < UPDATE_CHECK_INTERVAL_MS) {
            return;
          }
        }

        const body = await ContactNames.fetchUpdateManifest(UPDATE_MANIFEST_URL);
        await ContactNames.setPreference(LAST_CHECK_KEY, String(Date.now()));

        const manifest = parseManifest(body);
        if (!manifest || manifest.versionCode <= version.versionCode) {
          setAvailable(null);
          return;
        }

        const skipped = Number(await ContactNames.getPreference(SKIPPED_KEY, '0'));
        if (!force && skipped === manifest.versionCode) {
          return;
        }
        setAvailable(manifest);
      } catch (e) {
        // A failed check is not worth interrupting anyone over; it is only
        // surfaced on the screen that asked for it.
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChecking(false);
      }
    },
    [enabled],
  );

  const install = useCallback(async () => {
    if (!available) {
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      // The browser downloads it and Android asks about installing, exactly
      // as it would for any other file. Doing that inside the app would
      // need REQUEST_INSTALL_PACKAGES, which next to contacts access is
      // what got the app flagged as harmful.
      const opened = await ContactNames.openUpdatePage(available.apkUrl);
      if (!opened) {
        setError('No browser available to download the update.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }, [available]);

  const dismiss = useCallback(() => {
    const code = available?.versionCode;
    setAvailable(null);
    if (code && isNativeModuleAvailable()) {
      ContactNames.setPreference(SKIPPED_KEY, String(code)).catch(() => {});
    }
  }, [available]);

  useEffect(() => {
    check();
  }, [check]);

  return {available, current, checking, downloading, error, check, install, dismiss};
}

/** Returns null for anything that is not a well-formed manifest. */
function parseManifest(body: string): UpdateManifest | null {
  try {
    const raw = JSON.parse(body) as Partial<UpdateManifest>;
    if (
      typeof raw.versionCode !== 'number' ||
      typeof raw.versionName !== 'string' ||
      typeof raw.apkUrl !== 'string' ||
      // Only https, so an update cannot be swapped in over plain http.
      !/^https:\/\//.test(raw.apkUrl)
    ) {
      return null;
    }
    return {
      versionCode: raw.versionCode,
      versionName: raw.versionName,
      apkUrl: raw.apkUrl,
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    };
  } catch {
    return null;
  }
}
