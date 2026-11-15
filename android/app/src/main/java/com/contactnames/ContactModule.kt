package com.contactnames

import android.Manifest
import android.app.Activity
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * The JS-facing surface: contact lookup, schedule CRUD, and the manual
 * apply/restore actions. All scheduling state lives in SQLite so the native
 * alarm receivers can run with no JS context alive.
 */
@ReactModule(name = ContactModule.NAME)
class ContactModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  /** Settled when the file picker returns; only one may be open at a time. */
  private var pendingRestore: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode == PICK_BACKUP_REQUEST) {
      handlePickedBackup(if (resultCode == Activity.RESULT_OK) data else null)
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  override fun getName() = NAME

  private val store: ContactStore
    get() = ContactStore.get(reactContext)

  // ----------------------------------------------------------- permissions

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    try {
      val map = Arguments.createMap().apply {
        putBoolean("contacts", AlarmReceiver.hasContactsPermissions(reactContext))
        putBoolean("exactAlarm", NameScheduler.canScheduleExact(reactContext))
        putBoolean("exactAlarmRequiresGrant", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
      }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /**
   * SCHEDULE_EXACT_ALARM cannot be requested with a runtime dialog on Android
   * 12+; the user has to flip it in Settings.
   */
  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        promise.resolve(false)
        return
      }
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val activity = reactContext.currentActivity
      if (activity != null) activity.startActivity(intent) else reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      // Some OEM builds lack the dedicated screen; fall back to app settings.
      try {
        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${reactContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(fallback)
        promise.resolve(true)
      } catch (inner: Exception) {
        promise.reject(E_FAIL, inner)
      }
    }
  }

  // -------------------------------------------------------------- contacts

  @ReactMethod
  fun listContacts(query: String?, limit: Double, promise: Promise) {
    try {
      if (!AlarmReceiver.hasContactsPermissions(reactContext)) {
        promise.reject(E_PERMISSION, "READ_CONTACTS/WRITE_CONTACTS not granted")
        return
      }
      val max = if (limit <= 0) 200 else limit.toInt()
      val out: WritableArray = Arguments.createArray()
      for (record in ContactRepository.listContacts(reactContext, query, max)) {
        out.pushMap(record.toMap())
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  @ReactMethod
  fun findContactByPhone(phone: String, promise: Promise) {
    try {
      if (!AlarmReceiver.hasContactsPermissions(reactContext)) {
        promise.reject(E_PERMISSION, "READ_CONTACTS/WRITE_CONTACTS not granted")
        return
      }
      val record = ContactRepository.findByPhone(reactContext, phone)
      promise.resolve(record?.toMap())
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // ------------------------------------------------------------- schedules

  @ReactMethod
  fun getSchedules(promise: Promise) {
    try {
      val out: WritableArray = Arguments.createArray()
      for (schedule in store.allSchedules()) {
        out.pushMap(
          schedule.toMap(originalName = store.getBackup(schedule.phone)?.originalName),
        )
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /**
   * Creates or updates one slot. `id` absent (or <= 0) means insert. The
   * original contact name is captured here, before any rename can happen.
   */
  @ReactMethod
  fun saveSchedule(input: ReadableMap, promise: Promise) {
    try {
      val phoneRaw = input.getStringOrNull("phoneRaw")?.trim().orEmpty()
      val displayName = input.getStringOrNull("displayName")?.trim().orEmpty()
      val startMinutes = input.getIntOr("startMinutes", -1)
      val endMinutes = input.getIntOr("endMinutes", -1)
      val enabled = if (input.hasKey("enabled")) input.getBoolean("enabled") else true
      val daysMask = input.getIntOr("daysMask", Schedule.ALL_DAYS)
      val id = input.getIntOr("id", 0).toLong()

      if (phoneRaw.isEmpty()) {
        promise.reject(E_INVALID, "phoneRaw is required")
        return
      }
      if (displayName.isEmpty()) {
        promise.reject(E_INVALID, "displayName is required")
        return
      }
      if (startMinutes !in 0 until NameScheduler.MINUTES_PER_DAY ||
        endMinutes !in 0 until NameScheduler.MINUTES_PER_DAY
      ) {
        promise.reject(E_INVALID, "Times must fall inside a single day")
        return
      }
      if (startMinutes == endMinutes) {
        promise.reject(E_INVALID, "Start and end time cannot be the same")
        return
      }
      if (daysMask and Schedule.ALL_DAYS == 0) {
        promise.reject(E_INVALID, "Pick at least one day for this slot")
        return
      }

      val phone = PhoneUtil.normalize(phoneRaw)
      if (phone.isEmpty()) {
        promise.reject(E_INVALID, "phoneRaw contains no digits")
        return
      }

      if (overlapsExisting(phone, id, startMinutes, endMinutes, daysMask)) {
        promise.reject(E_INVALID, "This time range overlaps another slot for this contact")
        return
      }

      if (!AlarmReceiver.hasContactsPermissions(reactContext)) {
        promise.reject(E_PERMISSION, "READ_CONTACTS/WRITE_CONTACTS not granted")
        return
      }

      // Safety first: no slot is stored until the real name is backed up.
      val backup = NameScheduler.captureBackup(reactContext, store, phone, phoneRaw)
      if (backup == null) {
        promise.reject(E_NOT_FOUND, "No contact on this device matches $phoneRaw")
        return
      }

      if (id > 0) {
        store.updateSchedule(id, displayName, startMinutes, endMinutes, daysMask, enabled)
      } else {
        store.insertSchedule(
          phone,
          phoneRaw,
          displayName,
          startMinutes,
          endMinutes,
          daysMask,
          enabled,
        )
      }

      promise.resolve(NameScheduler.applyNow(reactContext).toMap())
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  @ReactMethod
  fun deleteSchedule(id: Double, promise: Promise) {
    try {
      store.deleteSchedule(id.toLong())
      promise.resolve(NameScheduler.applyNow(reactContext).toMap())
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /** Drops every slot for a number and hands the contact its original name back. */
  @ReactMethod
  fun deleteContactSchedules(phoneRaw: String, promise: Promise) {
    try {
      val phone = PhoneUtil.normalize(phoneRaw)
      store.deleteSchedulesForPhone(phone)
      promise.resolve(NameScheduler.applyNow(reactContext).toMap())
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // --------------------------------------------------------- apply/restore

  @ReactMethod
  fun applyNow(promise: Promise) {
    try {
      if (!AlarmReceiver.hasContactsPermissions(reactContext)) {
        promise.reject(E_PERMISSION, "READ_CONTACTS/WRITE_CONTACTS not granted")
        return
      }
      promise.resolve(NameScheduler.applyNow(reactContext).toMap())
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /** The panic button: every tracked contact back to its original name. */
  @ReactMethod
  fun restoreAll(promise: Promise) {
    try {
      if (!AlarmReceiver.hasContactsPermissions(reactContext)) {
        promise.reject(E_PERMISSION, "READ_CONTACTS/WRITE_CONTACTS not granted")
        return
      }
      promise.resolve(NameScheduler.restoreAll(reactContext).toMap())
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /** Restores one contact, forgets its slots, and stops tracking it. */
  @ReactMethod
  fun forgetContact(phoneRaw: String, promise: Promise) {
    try {
      val phone = PhoneUtil.normalize(phoneRaw)
      val backup = store.getBackup(phone)
      if (backup != null) {
        var rawIds = backup.rawIdList()
        if (rawIds.isEmpty()) {
          rawIds = ContactRepository.findByPhone(reactContext, backup.phoneRaw)
            ?.rawContactIds.orEmpty()
        }
        ContactRepository.setDisplayNameForRawContacts(reactContext, rawIds, backup.originalName)
      }
      store.deleteSchedulesForPhone(phone)
      store.clearAppliedName(phone)
      store.deleteBackup(phone)
      NameScheduler.rescheduleNext(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // ----------------------------------------------------------------- history

  @ReactMethod
  fun getHistory(limit: Double, promise: Promise) {
    try {
      val rows = store.recentHistory(limit.toInt().coerceIn(1, ContactStore.HISTORY_LIMIT))
      val out = Arguments.createArray()
      for (row in rows) out.pushMap(row.toMap())
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  @ReactMethod
  fun clearHistory(promise: Promise) {
    try {
      store.clearHistory()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // ---------------------------------------------------------- notifications

  @ReactMethod
  fun getNotificationSettings(promise: Promise) {
    try {
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("enabled", Notifier.enabled(reactContext))
          putBoolean("permissionGranted", Notifier.hasPermission(reactContext))
          putBoolean(
            "requiresGrant",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU,
          )
        },
      )
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  @ReactMethod
  fun setNotificationsEnabled(enabled: Boolean, promise: Promise) {
    try {
      Notifier.setEnabled(reactContext, enabled)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // --------------------------------------------------------- backup to file

  /** Mirrors the current backups into shared storage, outside app data. */
  @ReactMethod
  fun exportBackupFile(promise: Promise) {
    try {
      ExternalBackup.write(reactContext, store.allBackups())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /**
   * Opens the system file picker and restores from whatever is chosen.
   *
   * This is how a backup survives an uninstall: the file outlives the app,
   * and the picker grants read access to just that one file, so the app
   * never needs storage permission of its own.
   */
  @ReactMethod
  fun restoreFromBackupFile(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject(E_FAIL, "No foreground activity to show the picker on")
      return
    }
    if (pendingRestore != null) {
      promise.reject(E_FAIL, "A restore is already in progress")
      return
    }

    pendingRestore = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      // Some providers label .json as octet-stream, so both are accepted.
      .setType("*/*")
      .putExtra(
        Intent.EXTRA_MIME_TYPES,
        arrayOf("application/json", "text/plain", "application/octet-stream"),
      )
    try {
      activity.startActivityForResult(intent, PICK_BACKUP_REQUEST)
    } catch (e: Exception) {
      pendingRestore = null
      promise.reject(E_FAIL, e)
    }
  }

  private fun handlePickedBackup(data: Intent?) {
    val promise = pendingRestore ?: return
    pendingRestore = null

    val uri = data?.data
    if (uri == null) {
      // Cancelled; not an error worth showing anyone.
      promise.resolve(null)
      return
    }

    Thread {
      try {
        val json = reactContext.contentResolver.openInputStream(uri)
          ?.bufferedReader()?.use { it.readText() }
          ?: throw IllegalStateException("Could not read that file")

        val entries = ExternalBackup.parse(json)
        if (entries.isEmpty()) {
          promise.reject(E_INVALID, "That backup file has no contacts in it")
          return@Thread
        }
        if (!AlarmReceiver.hasContactsPermissions(reactContext)) {
          promise.reject(E_PERMISSION, "READ_CONTACTS/WRITE_CONTACTS not granted")
          return@Thread
        }

        val (restored, failed) = ExternalBackup.restore(reactContext, entries)
        promise.resolve(
          Arguments.createMap().apply {
            putInt("found", entries.size)
            putInt("restored", restored)
            putInt("failed", failed)
          },
        )
      } catch (e: Exception) {
        promise.reject(E_INVALID, e.message ?: "That file could not be read", e)
      }
    }.start()
  }

  // ----------------------------------------------------------------- updates

  @ReactMethod
  fun getAppVersion(promise: Promise) {
    try {
      promise.resolve(
        Arguments.createMap().apply {
          // A JS number holds this exactly; version codes never get near 2^53.
          putDouble("versionCode", Updater.currentVersionCode(reactContext).toDouble())
          putString("versionName", Updater.currentVersionName(reactContext))
        },
      )
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /** Returns the manifest body as text; the JS side owns its shape. */
  @ReactMethod
  fun fetchUpdateManifest(url: String, promise: Promise) {
    Thread {
      try {
        promise.resolve(Updater.fetchManifest(url))
      } catch (e: Exception) {
        promise.reject(E_NETWORK, e.message ?: "Update check failed", e)
      }
    }.start()
  }

  /** Opens the download in a browser; this app cannot install anything. */
  @ReactMethod
  fun openUpdatePage(url: String, promise: Promise) {
    try {
      promise.resolve(Updater.openInBrowser(reactContext, url))
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // --------------------------------------------------- battery optimisation

  /**
   * Whether the system has stopped deferring this app's background work.
   * When true, alarms fire on time even after the phone has been idle.
   */
  @ReactMethod
  fun isBatteryUnrestricted(promise: Promise) {
    try {
      val manager = reactContext.getSystemService(PowerManager::class.java)
      promise.resolve(manager?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: false)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  /**
   * Shows the system's own one-tap dialog rather than dropping the user into
   * a settings screen to hunt for the app. Some OEM builds remove the dialog;
   * there the battery settings page is opened instead.
   */
  @ReactMethod
  fun requestBatteryUnrestricted(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.parse("package:${reactContext.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

      if (intent.resolveActivity(reactContext.packageManager) != null) {
        reactContext.startActivity(intent)
        promise.resolve(true)
        return
      }

      val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (fallback.resolveActivity(reactContext.packageManager) != null) {
        reactContext.startActivity(fallback)
        promise.resolve(true)
        return
      }
      promise.resolve(false)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // ------------------------------------------------------------ preferences

  /** Small key/value store for UI choices such as the theme mode. */
  @ReactMethod
  fun getPreference(key: String, fallback: String, promise: Promise) {
    try {
      promise.resolve(store.getSetting(key, fallback))
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  @ReactMethod
  fun setPreference(key: String, value: String, promise: Promise) {
    try {
      store.setSetting(key, value)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // ------------------------------------------------------------ time picker

  /**
   * Opens the platform clock dialog so times are picked, not typed. Resolves
   * with the chosen minutes past midnight, or null if the user backed out.
   */
  @ReactMethod
  fun pickTime(initialMinutes: Double, promise: Promise) {
    val activity: Activity? = reactContext.currentActivity
    if (activity == null) {
      promise.reject(E_FAIL, "No foreground activity to show the picker on")
      return
    }
    val start = initialMinutes.toInt().coerceIn(0, NameScheduler.MINUTES_PER_DAY - 1)
    activity.runOnUiThread {
      // One-shot guard: Android can deliver both a set and a dismiss callback,
      // and a promise may only settle once.
      val settled = java.util.concurrent.atomic.AtomicBoolean(false)
      val dialog = TimePickerDialog(
        activity,
        { _, hour, minute ->
          if (settled.compareAndSet(false, true)) promise.resolve((hour * 60 + minute).toDouble())
        },
        start / 60,
        start % 60,
        android.text.format.DateFormat.is24HourFormat(activity),
      )
      dialog.setOnDismissListener {
        if (settled.compareAndSet(false, true)) promise.resolve(null)
      }
      dialog.show()
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val schedules = store.allSchedules()
      val map = Arguments.createMap().apply {
        putInt("scheduleCount", schedules.size)
        putInt("trackedContacts", schedules.map { it.phone }.distinct().size)
        putInt("backupCount", store.allBackups().size)
        putBoolean("exactAlarmAllowed", NameScheduler.canScheduleExact(reactContext))
        val next = NameScheduler.nextRunAtMillis(reactContext)
        if (next == null) putNull("nextRunAt") else putDouble("nextRunAt", next.toDouble())
      }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  @ReactMethod
  fun getBackups(promise: Promise) {
    try {
      val out: WritableArray = Arguments.createArray()
      for (backup in store.allBackups()) {
        out.pushMap(
          Arguments.createMap().apply {
            putString("phone", backup.phone)
            putString("phoneRaw", backup.phoneRaw)
            putString("originalName", backup.originalName)
            putString("appliedName", store.getAppliedName(backup.phone))
          },
        )
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject(E_FAIL, e)
    }
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Two slots for the same number must not overlap, or which name wins would
   * depend on row order. Minute-by-minute check so overnight wrap is handled.
   */
  /**
   * Two slots clash only if they are live at the same minute of the same
   * weekday, so the grid spans a whole week rather than a single day. A
   * Monday-only slot and a Saturday-only slot at the same hour no longer
   * collide.
   */
  private fun overlapsExisting(
    phone: String,
    editingId: Long,
    startMinutes: Int,
    endMinutes: Int,
    daysMask: Int,
  ): Boolean {
    val minutesPerWeek = 7 * NameScheduler.MINUTES_PER_DAY
    val occupied = BooleanArray(minutesPerWeek)
    for (existing in store.schedulesForPhone(phone)) {
      if (existing.id == editingId) continue
      for (slot in 0 until minutesPerWeek) {
        val day = slot / NameScheduler.MINUTES_PER_DAY
        val minute = slot % NameScheduler.MINUTES_PER_DAY
        if (existing.isActiveAt(minute, day)) occupied[slot] = true
      }
    }
    val candidate = Schedule(0, phone, "", "", startMinutes, endMinutes, daysMask, true)
    for (slot in 0 until minutesPerWeek) {
      val day = slot / NameScheduler.MINUTES_PER_DAY
      val minute = slot % NameScheduler.MINUTES_PER_DAY
      if (candidate.isActiveAt(minute, day) && occupied[slot]) return true
    }
    return false
  }

  companion object {
    const val NAME = "ContactModule"
    private const val E_FAIL = "E_CONTACT_MODULE"
    private const val E_PERMISSION = "E_PERMISSION"
    private const val E_INVALID = "E_INVALID_INPUT"
    private const val E_NOT_FOUND = "E_CONTACT_NOT_FOUND"
    private const val E_NETWORK = "E_NETWORK"
    private const val PICK_BACKUP_REQUEST = 7791

    val REQUIRED_PERMISSIONS = arrayOf(
      Manifest.permission.READ_CONTACTS,
      Manifest.permission.WRITE_CONTACTS,
    )
  }
}

// ------------------------------------------------------------- conversions

private fun ContactRecord.toMap(): WritableMap = Arguments.createMap().apply {
  putDouble("contactId", contactId.toDouble())
  putString("displayName", displayName)
  putString("phoneRaw", phoneRaw)
  putString("phone", phone)
  putInt("writableRawContacts", rawContactIds.size)
}

private fun Schedule.toMap(originalName: String?): WritableMap = Arguments.createMap().apply {
  putDouble("id", id.toDouble())
  putString("phone", phone)
  putString("phoneRaw", phoneRaw)
  putString("displayName", displayName)
  putInt("startMinutes", startMinutes)
  putInt("endMinutes", endMinutes)
  putInt("daysMask", daysMask)
  putBoolean("enabled", enabled)
  putString("originalName", originalName)
}

private fun HistoryEntry.toMap(): WritableMap = Arguments.createMap().apply {
  putDouble("id", id.toDouble())
  putString("phoneRaw", phoneRaw)
  putString("fromName", fromName)
  putString("toName", toName)
  putString("source", source)
  putDouble("changedAt", changedAt.toDouble())
}

private fun NameScheduler.ApplyResult.toMap(): WritableMap = Arguments.createMap().apply {
  putInt("changed", changed)
  putInt("skipped", skipped)
  putInt("failed", failed)
  if (nextRunAtMillis == null) putNull("nextRunAt") else putDouble("nextRunAt", nextRunAtMillis.toDouble())
}

private fun ReadableMap.getStringOrNull(key: String): String? =
  if (hasKey(key) && !isNull(key)) getString(key) else null

private fun ReadableMap.getIntOr(key: String, fallback: Int): Int =
  if (hasKey(key) && !isNull(key)) getDouble(key).toInt() else fallback
