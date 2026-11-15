package com.contactnames

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log

/**
 * One rule: "on these days, between 13:00 and 15:00, this number shows as
 * Rahul".
 *
 * [daysMask] is a 7-bit set where bit 0 is Sunday through bit 6 is Saturday,
 * matching `Calendar.DAY_OF_WEEK - 1`. [ALL_DAYS] (127) means every day.
 */
data class Schedule(
  val id: Long,
  val phone: String,
  val phoneRaw: String,
  val displayName: String,
  val startMinutes: Int,
  val endMinutes: Int,
  val daysMask: Int,
  val enabled: Boolean,
) {
  val overnight: Boolean get() = startMinutes > endMinutes

  fun runsOn(dayIndex: Int): Boolean = (daysMask shr dayIndex) and 1 == 1

  /**
   * A slot belongs to the day it *starts* on. An overnight slot selected for
   * Monday therefore covers Monday 22:00–23:59 and Tuesday 00:00–05:59, so the
   * early-morning half is tested against the previous day's bit.
   */
  fun isActiveAt(minutesOfDay: Int, dayIndex: Int): Boolean =
    if (!overnight) {
      runsOn(dayIndex) && minutesOfDay >= startMinutes && minutesOfDay < endMinutes
    } else {
      (runsOn(dayIndex) && minutesOfDay >= startMinutes) ||
        (runsOn(previousDay(dayIndex)) && minutesOfDay < endMinutes)
    }

  companion object {
    const val ALL_DAYS = 0b111_1111

    fun previousDay(dayIndex: Int): Int = (dayIndex + 6) % 7
  }
}

/** One recorded rename, newest first in the UI. */
data class HistoryEntry(
  val id: Long,
  val phone: String,
  val phoneRaw: String,
  val fromName: String,
  val toName: String,
  val source: String,
  val changedAt: Long,
)

/** The real name of a contact, captured once, before we ever rename it. */
data class Backup(
  val phone: String,
  val phoneRaw: String,
  val originalName: String,
  val rawContactIds: String,
)

/**
 * Local SQLite store. Deliberately plain [SQLiteOpenHelper] rather than Room:
 * the alarm receiver must read this with no React context alive, and the RN
 * Gradle setup carries no annotation processor.
 */
class ContactStore private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE TABLE contacts_backup (" +
        "phone TEXT PRIMARY KEY NOT NULL, " +
        "phone_raw TEXT NOT NULL, " +
        "original_name TEXT NOT NULL, " +
        "raw_contact_ids TEXT NOT NULL, " +
        "created_at INTEGER NOT NULL)",
    )
    db.execSQL(
      "CREATE TABLE schedules (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "phone TEXT NOT NULL, " +
        "phone_raw TEXT NOT NULL, " +
        "display_name TEXT NOT NULL, " +
        "start_minutes INTEGER NOT NULL, " +
        "end_minutes INTEGER NOT NULL, " +
        "days_mask INTEGER NOT NULL DEFAULT ${Schedule.ALL_DAYS}, " +
        "enabled INTEGER NOT NULL DEFAULT 1)",
    )
    db.execSQL("CREATE INDEX idx_schedules_phone ON schedules(phone)")
    // What we last wrote, so we never issue a redundant provider write.
    db.execSQL(
      "CREATE TABLE applied_state (" +
        "phone TEXT PRIMARY KEY NOT NULL, " +
        "applied_name TEXT NOT NULL, " +
        "applied_at INTEGER NOT NULL)",
    )
    createHistory(db)
    createSettings(db)
  }

  /**
   * Migrations are incremental and non-destructive: schedules the user built
   * are as precious as the backups, so nothing is dropped.
   */
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      db.execSQL(
        "ALTER TABLE schedules ADD COLUMN days_mask INTEGER NOT NULL " +
          "DEFAULT ${Schedule.ALL_DAYS}",
      )
      createHistory(db)
      createSettings(db)
    }
  }

  private fun createHistory(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE TABLE IF NOT EXISTS history (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "phone TEXT NOT NULL, " +
        "phone_raw TEXT NOT NULL, " +
        "from_name TEXT NOT NULL, " +
        "to_name TEXT NOT NULL, " +
        "source TEXT NOT NULL, " +
        "changed_at INTEGER NOT NULL)",
    )
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_history_time ON history(changed_at DESC)")
  }

  private fun createSettings(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE TABLE IF NOT EXISTS settings (" +
        "key TEXT PRIMARY KEY NOT NULL, " +
        "value TEXT NOT NULL)",
    )
  }

  // ---------------------------------------------------------------- backups

  /** Insert-only: an existing row holds the true original and must survive. */
  fun rememberOriginal(phone: String, phoneRaw: String, originalName: String, rawIds: List<Long>) {
    val values = ContentValues().apply {
      put("phone", phone)
      put("phone_raw", phoneRaw)
      put("original_name", originalName)
      put("raw_contact_ids", rawIds.joinToString(","))
      put("created_at", System.currentTimeMillis())
    }
    writableDatabase.insertWithOnConflict(
      "contacts_backup",
      null,
      values,
      SQLiteDatabase.CONFLICT_IGNORE,
    )
  }

  /** Raw contact ids change on re-sync or contact merge, so keep them fresh. */
  fun updateRawIds(phone: String, rawIds: List<Long>) {
    val values = ContentValues().apply { put("raw_contact_ids", rawIds.joinToString(",")) }
    writableDatabase.update("contacts_backup", values, "phone = ?", arrayOf(phone))
  }

  fun getBackup(phone: String): Backup? =
    readableDatabase
      .query("contacts_backup", null, "phone = ?", arrayOf(phone), null, null, null)
      .use { if (it.moveToFirst()) it.toBackup() else null }

  fun allBackups(): List<Backup> =
    readableDatabase
      .query("contacts_backup", null, null, null, null, null, "original_name ASC")
      .use { c -> c.mapRows { it.toBackup() } }

  fun deleteBackup(phone: String) {
    writableDatabase.delete("contacts_backup", "phone = ?", arrayOf(phone))
  }

  // -------------------------------------------------------------- schedules

  fun insertSchedule(
    phone: String,
    phoneRaw: String,
    displayName: String,
    startMinutes: Int,
    endMinutes: Int,
    daysMask: Int,
    enabled: Boolean,
  ): Long {
    val values = ContentValues().apply {
      put("phone", phone)
      put("phone_raw", phoneRaw)
      put("display_name", displayName)
      put("start_minutes", startMinutes)
      put("end_minutes", endMinutes)
      put("days_mask", daysMask)
      put("enabled", if (enabled) 1 else 0)
    }
    return writableDatabase.insert("schedules", null, values)
  }

  fun updateSchedule(
    id: Long,
    displayName: String,
    startMinutes: Int,
    endMinutes: Int,
    daysMask: Int,
    enabled: Boolean,
  ) {
    val values = ContentValues().apply {
      put("display_name", displayName)
      put("start_minutes", startMinutes)
      put("end_minutes", endMinutes)
      put("days_mask", daysMask)
      put("enabled", if (enabled) 1 else 0)
    }
    writableDatabase.update("schedules", values, "id = ?", arrayOf(id.toString()))
  }

  fun deleteSchedule(id: Long) {
    writableDatabase.delete("schedules", "id = ?", arrayOf(id.toString()))
  }

  fun deleteSchedulesForPhone(phone: String) {
    writableDatabase.delete("schedules", "phone = ?", arrayOf(phone))
  }

  fun allSchedules(): List<Schedule> =
    readableDatabase
      .query("schedules", null, null, null, null, null, "phone ASC, start_minutes ASC")
      .use { c -> c.mapRows { it.toSchedule() } }

  fun enabledSchedules(): List<Schedule> = allSchedules().filter { it.enabled }

  fun schedulesForPhone(phone: String): List<Schedule> =
    readableDatabase
      .query("schedules", null, "phone = ?", arrayOf(phone), null, null, "start_minutes ASC")
      .use { c -> c.mapRows { it.toSchedule() } }

  // ----------------------------------------------------------- applied state

  fun getAppliedName(phone: String): String? =
    readableDatabase
      .query("applied_state", arrayOf("applied_name"), "phone = ?", arrayOf(phone), null, null, null)
      .use { if (it.moveToFirst()) it.getString(0) else null }

  fun setAppliedName(phone: String, name: String) {
    val values = ContentValues().apply {
      put("phone", phone)
      put("applied_name", name)
      put("applied_at", System.currentTimeMillis())
    }
    writableDatabase.insertWithOnConflict(
      "applied_state",
      null,
      values,
      SQLiteDatabase.CONFLICT_REPLACE,
    )
  }

  fun clearAppliedName(phone: String) {
    writableDatabase.delete("applied_state", "phone = ?", arrayOf(phone))
  }

  fun clearAllAppliedNames() {
    writableDatabase.delete("applied_state", null, null)
  }

  // ----------------------------------------------------------------- history

  /** Records a rename that actually reached the contact provider. */
  fun addHistory(
    phone: String,
    phoneRaw: String,
    fromName: String,
    toName: String,
    source: String,
  ) {
    val values = ContentValues().apply {
      put("phone", phone)
      put("phone_raw", phoneRaw)
      put("from_name", fromName)
      put("to_name", toName)
      put("source", source)
      put("changed_at", System.currentTimeMillis())
    }
    writableDatabase.insert("history", null, values)
  }

  fun recentHistory(limit: Int): List<HistoryEntry> =
    readableDatabase
      .query("history", null, null, null, null, null, "changed_at DESC, id DESC", limit.toString())
      .use { c -> c.mapRows { it.toHistoryEntry() } }

  fun historyCount(): Int =
    readableDatabase.rawQuery("SELECT COUNT(*) FROM history", null).use {
      if (it.moveToFirst()) it.getInt(0) else 0
    }

  fun clearHistory() {
    writableDatabase.delete("history", null, null)
  }

  /**
   * Keeps the log from growing without bound; called after each write pass.
   *
   * The row count is checked first and the cut-off is resolved to a real id,
   * so the delete can never be handed an empty keep-set. An earlier version
   * bound the LIMIT as a query parameter and wiped the whole table on this
   * device's SQLite build, which is exactly the failure this shape rules out.
   */
  fun trimHistory(keep: Int) {
    if (keep < 1) return
    val db = writableDatabase
    val total = historyCount()
    if (total <= keep) return

    // The id of the newest row that must survive.
    val cutoff = db.rawQuery(
      "SELECT id FROM history ORDER BY changed_at DESC, id DESC LIMIT 1 OFFSET ${keep - 1}",
      null,
    ).use { if (it.moveToFirst()) it.getLong(0) else null } ?: return

    val removed = db.delete(
      "history",
      "changed_at < (SELECT changed_at FROM history WHERE id = ?) OR " +
        "(changed_at = (SELECT changed_at FROM history WHERE id = ?) AND id < ?)",
      arrayOf(cutoff.toString(), cutoff.toString(), cutoff.toString()),
    )
    Log.i(TAG, "trimHistory: kept $keep of $total, removed $removed")
  }

  // ---------------------------------------------------------------- settings

  fun getSetting(key: String, fallback: String): String =
    readableDatabase
      .query("settings", arrayOf("value"), "key = ?", arrayOf(key), null, null, null)
      .use { if (it.moveToFirst()) it.getString(0) else fallback }

  fun setSetting(key: String, value: String) {
    val values = ContentValues().apply {
      put("key", key)
      put("value", value)
    }
    writableDatabase.insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE)
  }

  companion object {
    private const val TAG = "ContactStore"
    private const val DB_NAME = "contact_names.db"
    private const val DB_VERSION = 2

    /** Settings keys. */
    const val KEY_NOTIFICATIONS = "notifications_enabled"

    /** How many history rows to keep. */
    const val HISTORY_LIMIT = 500

    @Volatile
    private var instance: ContactStore? = null

    fun get(context: Context): ContactStore =
      instance ?: synchronized(this) {
        instance ?: ContactStore(context).also { instance = it }
      }
  }
}

// ------------------------------------------------------------------ cursors

private inline fun <T> Cursor.mapRows(transform: (Cursor) -> T): List<T> {
  val out = ArrayList<T>(count)
  while (moveToNext()) out.add(transform(this))
  return out
}

private fun Cursor.toBackup() = Backup(
  phone = getString(getColumnIndexOrThrow("phone")),
  phoneRaw = getString(getColumnIndexOrThrow("phone_raw")),
  originalName = getString(getColumnIndexOrThrow("original_name")),
  rawContactIds = getString(getColumnIndexOrThrow("raw_contact_ids")),
)

private fun Cursor.toSchedule() = Schedule(
  id = getLong(getColumnIndexOrThrow("id")),
  phone = getString(getColumnIndexOrThrow("phone")),
  phoneRaw = getString(getColumnIndexOrThrow("phone_raw")),
  displayName = getString(getColumnIndexOrThrow("display_name")),
  startMinutes = getInt(getColumnIndexOrThrow("start_minutes")),
  endMinutes = getInt(getColumnIndexOrThrow("end_minutes")),
  daysMask = getInt(getColumnIndexOrThrow("days_mask")),
  enabled = getInt(getColumnIndexOrThrow("enabled")) == 1,
)

private fun Cursor.toHistoryEntry() = HistoryEntry(
  id = getLong(getColumnIndexOrThrow("id")),
  phone = getString(getColumnIndexOrThrow("phone")),
  phoneRaw = getString(getColumnIndexOrThrow("phone_raw")),
  fromName = getString(getColumnIndexOrThrow("from_name")),
  toName = getString(getColumnIndexOrThrow("to_name")),
  source = getString(getColumnIndexOrThrow("source")),
  changedAt = getLong(getColumnIndexOrThrow("changed_at")),
)

fun Backup.rawIdList(): List<Long> =
  rawContactIds.split(",").mapNotNull { it.trim().toLongOrNull() }
