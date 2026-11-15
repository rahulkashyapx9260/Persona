/**
 * Where the app looks for a newer build.
 *
 * Point this at a small JSON file you control. GitHub Releases works well and
 * costs nothing: commit `latest.json` to a public repo and use its raw URL,
 * then attach the APK to a release and put that download URL in `apkUrl`.
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
 * Until this is set to a real URL the updater stays switched off: no network
 * calls are made and nothing about updates appears in the UI.
 */
export const UPDATE_MANIFEST_URL = '';

/** True when an update source has actually been configured. */
export function updatesConfigured(): boolean {
  return /^https:\/\/\S+$/.test(UPDATE_MANIFEST_URL.trim());
}

/** How long to wait between update checks, in milliseconds. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
