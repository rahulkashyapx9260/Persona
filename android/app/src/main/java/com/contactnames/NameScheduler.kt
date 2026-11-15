package com.contactnames

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.Calendar

/**
 * The scheduling brain. Instead of one alarm per time slot, a single alarm is
 * kept armed for the *next boundary* across every slot. When it fires we
 * recompute the correct name for every tracked number from the database and
 * re-arm. That makes the system self-healing: a missed or doze-delayed alarm
 * still converges on the right state at the next tick, boot, or app open.
 */
object NameScheduler {

  private const val TAG = "NameScheduler"
  private const val ALARM_REQUEST_CODE = 7781
  const val ACTION_APPLY = "com.contactnames.ACTION_APPLY_NAMES"

  /** Where a rename came from, recorded against each history row. */
  const val SOURCE_ALARM = "alarm"
  const val SOURCE_MANUAL = "manual"
  const val SOURCE_BOOT = "boot"
  const val SOURCE_RESTORE = "restore"

  /** Result of one reconciliation pass, surfaced to the UI for feedback. */
  data class ApplyResult(
    val changed: Int,
    val skipped: Int,
    val failed: Int,
    val nextRunAtMillis: Long?,
  )

  // --------------------------------------------------------------- applying

  /** Brings every tracked contact in line with the slot that is active now. */
  @Synchronized
  fun applyNow(context: Context, source: String = SOURCE_MANUAL): ApplyResult {
    val store = ContactStore.get(context)
    val now = Calendar.getInstance()
    val nowMinutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
    val today = now.get(Calendar.DAY_OF_WEEK) - 1
    val schedules = store.enabledSchedules()

    // Every number we might have touched: one with slots, or one we renamed
    // before and must now hand back its original name.
    val phones = LinkedHashMap<String, String>()
    for (s in schedules) phones[s.phone] = s.phoneRaw
    for (b in store.allBackups()) phones.putIfAbsent(b.phone, b.phoneRaw)

    var changed = 0
    var skipped = 0
    var failed = 0
    val notified = ArrayList<Pair<String, String>>()

    for ((phone, phoneRaw) in phones) {
      val active =
        schedules.firstOrNull { it.phone == phone && it.isActiveAt(nowMinutes, today) }
      val backup = store.getBackup(phone) ?: captureBackup(context, store, phone, phoneRaw)
      if (backup == null) {
        Log.w(TAG, "No contact found for $phone; nothing to rename")
        failed++
        continue
      }
      val target = active?.displayName ?: backup.originalName

      if (store.getAppliedName(phone) == target) {
        skipped++
        continue
      }

      var rawIds = backup.rawIdList()
      if (rawIds.isEmpty()) {
        // Ids can go stale after a sync; re-resolve them.
        val fresh = ContactRepository.findByPhone(context, backup.phoneRaw)
        rawIds = fresh?.rawContactIds ?: emptyList()
        if (rawIds.isNotEmpty()) store.updateRawIds(phone, rawIds)
      }

      // What the contact shows right now, for an honest history entry.
      val previous = store.getAppliedName(phone) ?: backup.originalName

      val ok = ContactRepository.setDisplayNameForRawContacts(context, rawIds, target)
      if (ok) {
        store.setAppliedName(phone, target)
        store.addHistory(phone, phoneRaw, previous, target, source)
        notified.add(previous to target)
        changed++
      } else {
        failed++
        Log.w(TAG, "Failed to rename $phone to $target")
      }
    }

    if (changed > 0) {
      store.trimHistory(ContactStore.HISTORY_LIMIT)
      Notifier.notifyChanges(context, notified)
    }

    val next = rescheduleNext(context)
    Log.i(TAG, "applyNow: changed=$changed skipped=$skipped failed=$failed next=$next")
    return ApplyResult(changed, skipped, failed, next)
  }

  /** Puts every backed-up contact back to the name it had before this app. */
  @Synchronized
  fun restoreAll(context: Context): ApplyResult {
    val store = ContactStore.get(context)
    var changed = 0
    var failed = 0
    for (backup in store.allBackups()) {
      var rawIds = backup.rawIdList()
      if (rawIds.isEmpty()) {
        rawIds = ContactRepository.findByPhone(context, backup.phoneRaw)?.rawContactIds.orEmpty()
      }
      val previous = store.getAppliedName(backup.phone) ?: backup.originalName
      if (ContactRepository.setDisplayNameForRawContacts(context, rawIds, backup.originalName)) {
        store.setAppliedName(backup.phone, backup.originalName)
        if (previous != backup.originalName) {
          store.addHistory(
            backup.phone,
            backup.phoneRaw,
            previous,
            backup.originalName,
            SOURCE_RESTORE,
          )
        }
        changed++
      } else {
        failed++
      }
    }
    store.trimHistory(ContactStore.HISTORY_LIMIT)
    return ApplyResult(changed, 0, failed, null)
  }

  /**
   * Records the pre-rename name for a number, once. Called before the first
   * schedule is saved so there is always something to restore.
   */
  fun captureBackup(
    context: Context,
    store: ContactStore,
    phone: String,
    phoneRaw: String,
  ): Backup? {
    val existing = store.getBackup(phone)
    if (existing != null) return existing
    val record = ContactRepository.findByPhone(context, phoneRaw) ?: return null
    store.rememberOriginal(phone, record.phoneRaw, record.displayName, record.rawContactIds)
    return store.getBackup(phone)
  }

  // ------------------------------------------------------------- scheduling

  /** Arms the alarm for the next slot boundary. Returns that time, if any. */
  fun rescheduleNext(context: Context): Long? {
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return null
    val schedules = ContactStore.get(context).enabledSchedules()
    val pendingIntent = buildPendingIntent(context)

    if (schedules.isEmpty()) {
      alarmManager.cancel(pendingIntent)
      return null
    }

    val triggerAt = nextBoundaryMillis(schedules) ?: return null
    val exactAllowed = canScheduleExact(context)
    try {
      if (exactAllowed) {
        alarmManager.setExactAndAllowWhileIdle(
          AlarmManager.RTC_WAKEUP,
          triggerAt,
          pendingIntent,
        )
      } else {
        // Without the exact-alarm grant the switch can be a few minutes late,
        // but it still happens.
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      }
    } catch (e: SecurityException) {
      Log.w(TAG, "Exact alarm denied, falling back to inexact", e)
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    }
    return triggerAt
  }

  fun cancel(context: Context) {
    context.getSystemService(AlarmManager::class.java)?.cancel(buildPendingIntent(context))
  }

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
    return alarmManager.canScheduleExactAlarms()
  }

  fun nextRunAtMillis(context: Context): Long? =
    nextBoundaryMillis(ContactStore.get(context).enabledSchedules())

  private fun buildPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).setAction(ACTION_APPLY)
    return PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /**
   * Earliest boundary strictly in the future, honouring each slot's day mask.
   *
   * Days matter now, so a fixed "today or tomorrow" guess is not enough: a
   * weekend-only slot seen on Monday has its next boundary five days out. Each
   * slot's own days are walked over the coming week instead. An overnight
   * slot's end lands on the day *after* the day it started, which is why the
   * end boundary is offset rather than taken on the same day.
   */
  private fun nextBoundaryMillis(schedules: List<Schedule>): Long? {
    if (schedules.isEmpty()) return null
    val now = System.currentTimeMillis()
    var best: Long? = null

    // Eight days, so a slot that runs only today is still found a week out
    // after today's occurrence has already passed.
    for (offset in 0..7) {
      val day = Calendar.getInstance().apply {
        add(Calendar.DAY_OF_YEAR, offset)
      }
      val dayIndex = day.get(Calendar.DAY_OF_WEEK) - 1

      for (s in schedules) {
        if (!s.runsOn(dayIndex)) continue
        val startAt = atMinutes(day, s.startMinutes, 0)
        val endAt = atMinutes(day, s.endMinutes, if (s.overnight) 1 else 0)
        for (candidate in longArrayOf(startAt, endAt)) {
          if (candidate > now + 1_000L && (best == null || candidate < best!!)) {
            best = candidate
          }
        }
      }
    }
    return best
  }

  /** [day] at [minutes] past midnight, shifted by [dayOffset] whole days. */
  private fun atMinutes(day: Calendar, minutes: Int, dayOffset: Int): Long =
    (day.clone() as Calendar).apply {
      add(Calendar.DAY_OF_YEAR, dayOffset)
      set(Calendar.HOUR_OF_DAY, minutes / 60)
      set(Calendar.MINUTE, minutes % 60)
      // A second past the boundary, so the slot is unambiguously current.
      set(Calendar.SECOND, 1)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

  const val MINUTES_PER_DAY = 24 * 60
}
