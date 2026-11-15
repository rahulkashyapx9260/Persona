#!/usr/bin/env node
/**
 * Cuts a release: bumps the version, builds a signed APK, and writes the
 * manifest the in-app updater reads.
 *
 *   node scripts/release.mjs 1.1
 *   node scripts/release.mjs 1.1 --notes "Faster contact search."
 *
 * versionCode always goes up by one. Android refuses to install a build whose
 * versionCode is not higher than the installed one, so this is what makes an
 * update land on a phone that already has Persona — keeping its data, because
 * the signing key has not changed.
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gradleFile = join(root, 'android', 'app', 'build.gradle');
const distDir = join(root, 'dist');

const args = process.argv.slice(2);
const versionName = args.find(a => !a.startsWith('--'));
const notesIndex = args.indexOf('--notes');
const notes = notesIndex >= 0 ? args[notesIndex + 1] : undefined;

if (!versionName || !/^\d+(\.\d+)*$/.test(versionName)) {
  console.error('Usage: node scripts/release.mjs <versionName> [--notes "..."]');
  console.error('Example: node scripts/release.mjs 1.1 --notes "Faster search."');
  process.exit(1);
}

// ---------------------------------------------------------------- versioning

const gradle = readFileSync(gradleFile, 'utf8');
const codeMatch = gradle.match(/versionCode\s+(\d+)/);
if (!codeMatch) {
  console.error('Could not find versionCode in android/app/build.gradle');
  process.exit(1);
}

const nextCode = Number(codeMatch[1]) + 1;
const updated = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
writeFileSync(gradleFile, updated);
console.log(`version  ${versionName} (code ${nextCode})`);

// ------------------------------------------------------------------- build

console.log('building signed release APK…');
// An absolute path, because a bare `gradlew.bat` is looked up on PATH
// rather than in the working directory on Windows.
const gradlew = join(
  root,
  'android',
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
);
try {
  execFileSync(gradlew, ['app:assembleRelease'], {
    cwd: join(root, 'android'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
} catch {
  // Put the version back so a failed build does not burn a version number.
  writeFileSync(gradleFile, gradle);
  console.error('\nBuild failed — version left unchanged.');
  process.exit(1);
}

// ------------------------------------------------------------------ output

mkdirSync(distDir, {recursive: true});
const builtApk = join(
  root,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);
const apkName = `Persona-${versionName}.apk`;
copyFileSync(builtApk, join(distDir, apkName));

// The manifest lives at the repository root because that is what the app
// fetches over GitHub's raw host — dist/ is ignored by git and would never
// be published. The APK stays in dist/ and is attached to a GitHub release.
const manifestPath = join(root, 'latest.json');
let previous = {};
try {
  previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  // First release, or an unreadable file — either way, start fresh.
}

const manifest = {
  versionCode: nextCode,
  versionName,
  // Both the tag and the file name carry the version, so both are rewritten
  // — replacing only the file name left the URL pointing at the previous
  // release's tag, which does not contain the new APK.
  apkUrl: String(previous.apkUrl ?? '').replace(
    /\/download\/v[\d.]+\/Persona-[\d.]+\.apk$/,
    `/download/v${versionName}/${apkName}`,
  ),
  notes: notes ?? `Persona ${versionName}`,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`\napk      dist/${apkName}`);
console.log('manifest latest.json');
if (!/^https:\/\//.test(manifest.apkUrl)) {
  console.log(
    '\nNext: upload the APK somewhere public, put that download URL in\n' +
      'dist/latest.json as "apkUrl", and publish latest.json at the address\n' +
      'set in src/config.ts (UPDATE_MANIFEST_URL).',
  );
}
