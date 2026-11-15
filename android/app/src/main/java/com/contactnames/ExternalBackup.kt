package com.contactnames

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * A copy of the original names, kept outside the app's own storage.
 *
 * Uninstalling an app deletes its database, and Android gives an app no
 * chance to run anything on the way out. If someone removes Persona while a
 * slot is live, the renamed contact would be stranded with no record of what
 * it used to be called. This file is that record: it lives in the shared
 * Downloads folder, so it survives the uninstall.
 *
 * Reading it back is deliberately not automatic. Once the app is uninstalled
 * the file is orphaned, and a reinstalled app cannot reach it again without
 * broad storage access that this app has no business holding. So the file is
 * written silently, and restoring from it goes through the system file
 * picker, which costs the user one tap and needs no permission at all.
 */
object ExternalBackup {

  private const val TAG = "ExternalBackup"
  const val FILE_NAME = "persona-contact-backup.json"
  private const val FOLDER = "Persona"

  /** Mirrors the current backups to shared storage. Failure is not fatal. */
  fun write(context: Context, backups: List<Backup>) {
    val payload = JSONObject().apply {
      put("app", "Persona")
      put("savedAt", System.currentTimeMillis())
      put(
        "contacts",
        JSONArray().apply {
          for (backup in backups) {
            put(
              JSONObject().apply {
                put("phone", backup.phone)
                put("phoneRaw", backup.phoneRaw)
                put("originalName", backup.originalName)
              },
            )
          }
        },
      )
    }.toString(2)

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        writeViaMediaStore(context, payload)
      } else {
        writeLegacy(payload)
      }
    } catch (e: Exception) {
      // The in-app database is still the source of truth; this is a spare.
      Log.w(TAG, "Could not write the external backup", e)
    }
  }

  /** Replaces our previous entry rather than piling up copies. */
  private fun writeViaMediaStore(context: Context, payload: String) {
    val resolver = context.contentResolver
    val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
    val relative = "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER"

    val existing = resolver.query(
      collection,
      arrayOf(MediaStore.Downloads._ID),
      "${MediaStore.Downloads.DISPLAY_NAME} = ? AND " +
        "${MediaStore.Downloads.RELATIVE_PATH} LIKE ?",
      arrayOf(FILE_NAME, "$relative%"),
      null,
    )?.use { if (it.moveToFirst()) it.getLong(0) else null }

    val uri: Uri = if (existing != null) {
      MediaStore.Downloads.EXTERNAL_CONTENT_URI.buildUpon()
        .appendPath(existing.toString())
        .build()
    } else {
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, FILE_NAME)
        put(MediaStore.Downloads.MIME_TYPE, "application/json")
        put(MediaStore.Downloads.RELATIVE_PATH, relative)
      }
      resolver.insert(collection, values)
        ?: throw IllegalStateException("Downloads collection refused the file")
    }

    // Truncating matters: a shorter payload must not leave the tail of a
    // longer one behind.
    resolver.openOutputStream(uri, "wt")?.use { it.write(payload.toByteArray()) }
      ?: throw IllegalStateException("Could not open the backup for writing")
  }

  private fun writeLegacy(payload: String) {
    @Suppress("DEPRECATION")
    val downloads = Environment.getExternalStoragePublicDirectory(
      Environment.DIRECTORY_DOWNLOADS,
    )
    val dir = File(downloads, FOLDER).apply { mkdirs() }
    File(dir, FILE_NAME).writeText(payload)
  }

  /** One entry from a backup file, as the restore flow reads it. */
  data class Entry(val phone: String, val phoneRaw: String, val originalName: String)

  /** Parses a file's contents, rejecting anything that is not ours. */
  fun parse(json: String): List<Entry> {
    val root = JSONObject(json)
    if (root.optString("app") != "Persona") {
      throw IllegalArgumentException("That file was not written by Persona")
    }
    val array = root.optJSONArray("contacts") ?: return emptyList()
    val out = ArrayList<Entry>(array.length())
    for (i in 0 until array.length()) {
      val item = array.optJSONObject(i) ?: continue
      val phone = item.optString("phone")
      val phoneRaw = item.optString("phoneRaw")
      val originalName = item.optString("originalName")
      if (phone.isNotEmpty() && originalName.isNotEmpty()) {
        out.add(Entry(phone, phoneRaw.ifEmpty { phone }, originalName))
      }
    }
    return out
  }

  /**
   * Puts every name in [entries] back, skipping contacts that already carry
   * their original name. Returns how many were actually changed.
   */
  fun restore(context: Context, entries: List<Entry>): Pair<Int, Int> {
    var restored = 0
    var failed = 0
    for (entry in entries) {
      val record = ContactRepository.findByPhone(context, entry.phoneRaw)
      if (record == null) {
        // The contact is gone; nothing to put back.
        continue
      }
      if (record.displayName == entry.originalName) {
        continue
      }
      val ok = ContactRepository.setDisplayNameForRawContacts(
        context,
        record.rawContactIds,
        entry.originalName,
      )
      if (ok) restored++ else failed++
    }
    return restored to failed
  }
}
