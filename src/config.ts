/**
 * Where the app looks for a newer build.
 *
 * It reads `latest.json` from the repository root over GitHub's raw host.
 * `npm run release` rewrites that file; committing and pushing it is what
 * actually publishes an update. The APK itself is attached to a GitHub
 * release, and `apkUrl` points at that download.
 *
 * The file looks like this — `scripts/release.mjs` writes it for you:
 *
 *   {
 *     "versionCode": 2,
 *     "versionName": "1.1",
 *     "apkUrl": "https://github.com/<you>/<repo>/releases/download/v1.1/Persona-1.1.apk",
 *     "notes": "Faster contact search."
 *   }
 *
 * Blanking this switches the updater off entirely: no network calls are made
 * and nothing about updates appears in the UI.
 */
export const UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/rahulkashyapx9260/Persona/main/latest.json';

/** True when an update source has actually been configured. */
export function updatesConfigured(): boolean {
  return /^https:\/\/\S+$/.test(UPDATE_MANIFEST_URL.trim());
}

/** How long to wait between update checks, in milliseconds. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
