# Persona — implementation notes

> The app is called **Persona**. The Android package id stays
> `com.contactnames` (and the repo folder keeps that name): changing it
> would make Android treat this as a different app and drop every saved
> backup, schedule and history row.

An Android app (React Native CLI) that rewrites a contact's name on a schedule:
`13:00–15:00 → "Rahul"`, `15:00–18:00 → "Rohit"`, and the original name outside
every slot.

## How it fits together

```
App.tsx
└── src/screens/HomeScreen.tsx        permissions · status · schedule list
    ├── src/components/ContactPickerModal.tsx
    ├── src/components/SlotEditorModal.tsx
    ├── src/native/ContactNames.ts    typed bridge + runtime permissions
    └── src/time.ts                   minutes-from-midnight helpers

android/app/src/main/java/com/contactnames/
├── ContactModule.kt       the JS-facing native module (schedule CRUD, apply, restore)
├── ContactPackage.kt      registers the module
├── MainApplication.kt     adds ContactPackage() to the package list
├── ContactRepository.kt   all ContentResolver reads/writes
├── ContactStore.kt        SQLite: backups, schedules, applied state
├── NameScheduler.kt       alarm arming + the reconcile pass
├── AlarmReceiver.kt       fires at each slot boundary
├── BootReceiver.kt        re-arms after reboot / update / clock change
└── PhoneUtil.kt           phone number normalisation
```

### Two design decisions worth knowing

**One rolling alarm, not one alarm per slot.** A single alarm is armed for the
*next boundary* across all slots. When it fires, `NameScheduler.applyNow()`
recomputes the correct name for every tracked number from the database and
re-arms. A missed or Doze-delayed alarm therefore self-heals at the next tick,
at boot, or when the app is opened — no drift, no alarm bookkeeping.

**Schedules live in SQLite, not AsyncStorage.** The alarm receiver runs with no
JS context alive, so it must be able to read the schedule itself. Plain
`SQLiteOpenHelper` is used rather than Room: Room needs an annotation processor
(KSP) that the React Native Gradle setup does not configure, and the schema here
is three tables.

Tables: `contacts_backup` (insert-only original name per number),
`schedules`, `applied_state` (the last name actually written, so no redundant
provider writes).

`ContactPackage` extends `BaseReactPackage`, so the module is created lazily on
first use rather than at startup. It is a legacy bridge module reached through
RN 0.88's bridgeless interop layer, which keeps it free of codegen boilerplate.

### Renaming a contact, correctly

`ContactsContract.Contacts.DISPLAY_NAME` is **read-only** — the provider derives
it. The rename writes the `StructuredName` data row of each raw contact
(`ContactRepository.setDisplayNameForRawContacts`), setting `DISPLAY_NAME` and
`GIVEN_NAME` and clearing the other name parts so a stale surname cannot
reappear. Raw contacts owned by read-only sync adapters (WhatsApp, Telegram,
Signal, …) are skipped, and if a batch is still rejected each operation is
retried on its own so one locked raw contact cannot fail the whole rename.

## Build and run

```bash
npm install
npm run android          # a full rebuild — a Metro reload will NOT pick up native code
```

The app shows a "Native module missing" screen if `ContactModule` is not linked,
which is the usual symptom of reloading JS instead of rebuilding.

Local toolchain note: `android/build.gradle` asks for `buildToolsVersion
"37.0.0"` and `ndkVersion "27.1.12297006"`. Install them in Android Studio's SDK
Manager (or lower the values) if Gradle reports them missing.

## Verification done here

- `npx tsc --noEmit`, `npx eslint App.tsx src` — clean
- `npx jest` — 7 tests pass (`__tests__/time.test.ts` covers time parsing, slot
  boundaries and the overnight wrap)
- `./gradlew :app:compileDebugKotlin` — BUILD SUCCESSFUL, no warnings from
  `com.contactnames`
- `./gradlew :app:processDebugMainManifest` — both receivers merge as expected

Not verified: on-device behaviour. The rename path, the alarm firing and the
boot reschedule need a real device or emulator with contacts on it.

`react-native-contacts` is still in `package.json` from the scaffold but is
unused — contact reads go through the native module. Remove it if you like.

## Permissions

| Permission | How it is obtained |
| --- | --- |
| `READ_CONTACTS`, `WRITE_CONTACTS` | runtime dialog, from the home screen |
| `RECEIVE_BOOT_COMPLETED` | install-time, no prompt |
| `SCHEDULE_EXACT_ALARM` | **Settings toggle on Android 12+**, not a dialog |

Exact alarms cannot be requested with a runtime prompt. The app detects the
missing grant (`AlarmManager.canScheduleExactAlarms()`), shows a card, and deep
links to `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM`. Without it the app
falls back to `setAndAllowWhileIdle`, so switches still happen, a few minutes
late at worst.

If you publish this on Google Play, note that `SCHEDULE_EXACT_ALARM` needs a
declared use case, and `USE_EXACT_ALARM` is restricted to alarm-clock and
calendar apps — it is deliberately *not* used here.

## Using the app

1. Grant contacts access, then allow exact alarms when prompted.
2. **+ Add a contact schedule** → pick a contact. Its current name is backed up
   at this point, before anything is changed.
3. Add slots: a name plus `From`/`To` in 24-hour form (`13:00`). Slots that run
   past midnight (`22:00 → 06:00`) are supported. Overlapping slots for the same
   number are rejected, so which name wins is never ambiguous.
4. **Apply now** forces a reconcile; **Restore all** returns every tracked
   contact to its original name while keeping the slots.
5. **Remove** on a contact restores its name and deletes its slots.

## Things to be aware of

- **Synced accounts.** Renaming a contact that belongs to a Google (or other
  synced) account propagates the new name to that account, and to your other
  devices. A contact stored on the device or SIM stays local. Test with a
  device-local contact first.
- **Battery optimisation.** Aggressive OEM power management (Xiaomi, Oppo,
  Vivo, Samsung) can delay or drop alarms. Exclude the app from battery
  optimisation for reliable on-the-minute switching. Because the design
  reconciles rather than replays, a dropped alarm self-corrects at the next
  boundary or app open.
- **Caller-ID surfaces.** The dialer and messaging apps read the same contact
  store, but some keep their own cache; an incoming call during a slot may show
  the previous name until that cache refreshes.
- **The backup is the safety net.** `contacts_backup` is insert-only and keeps
  the pre-app name forever. Uninstalling the app clears that database **without
  restoring names** — run *Restore all* before uninstalling.
