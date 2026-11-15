package com.contactnames

import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.util.Log

/** A contact as we surface it to the UI. */
data class ContactRecord(
  val contactId: Long,
  val displayName: String,
  val phoneRaw: String,
  val phone: String,
  val rawContactIds: List<Long>,
)

/**
 * All ContentResolver work for reading and renaming contacts.
 *
 * Note: [ContactsContract.Contacts.DISPLAY_NAME] is read-only — it is derived
 * by the provider. The name is actually changed by writing the
 * StructuredName data row of each writable raw contact.
 */
object ContactRepository {

  private const val TAG = "ContactRepository"

  /** Sync adapters that mirror other apps; renaming them is pointless or rejected. */
  private val NON_WRITABLE_ACCOUNT_TYPES = setOf(
    "com.whatsapp",
    "com.whatsapp.w4b",
    "org.telegram.messenger",
    "org.thoughtcrime.securesms",
    "com.google.android.apps.tachyon",
    "com.viber.voip",
    "com.instagram.android",
    "com.facebook.messenger",
  )

  // ------------------------------------------------------------------ read

  /** Contacts that have at least one phone number, optionally filtered by [query]. */
  fun listContacts(context: Context, query: String?, limit: Int): List<ContactRecord> {
    val projection = arrayOf(
      ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
      ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
      ContactsContract.CommonDataKinds.Phone.NUMBER,
    )
    val trimmed = query?.trim().orEmpty()
    val uri: Uri = if (trimmed.isEmpty()) {
      ContactsContract.CommonDataKinds.Phone.CONTENT_URI
    } else {
      Uri.withAppendedPath(
        ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI,
        Uri.encode(trimmed),
      )
    }

    val seen = LinkedHashMap<Long, ContactRecord>()
    context.contentResolver.query(
      uri,
      projection,
      null,
      null,
      "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY} COLLATE NOCASE ASC",
    )?.use { cursor ->
      val idIdx = cursor.getColumnIndexOrThrow(projection[0])
      val nameIdx = cursor.getColumnIndexOrThrow(projection[1])
      val numberIdx = cursor.getColumnIndexOrThrow(projection[2])
      while (cursor.moveToNext() && seen.size < limit) {
        val contactId = cursor.getLong(idIdx)
        if (seen.containsKey(contactId)) continue
        val number = cursor.getString(numberIdx) ?: continue
        seen[contactId] = ContactRecord(
          contactId = contactId,
          displayName = cursor.getString(nameIdx) ?: number,
          phoneRaw = number,
          phone = PhoneUtil.normalize(number),
          rawContactIds = emptyList(),
        )
      }
    }
    if (seen.isEmpty()) return emptyList()

    // Writability is resolved for the whole page in one query. Asking per
    // contact would be a provider round trip each, which is what made the
    // search feel slow — and leaving it unset made every contact look
    // read-only.
    val writable = writableRawIdsFor(context, seen.keys)
    return seen.values.map { it.copy(rawContactIds = writable[it.contactId].orEmpty()) }
  }

  /**
   * Maps each contact id to its writable raw contact ids, in a single query.
   * Contacts absent from the result have nothing this app may rename.
   */
  private fun writableRawIdsFor(
    context: Context,
    contactIds: Collection<Long>,
  ): Map<Long, List<Long>> {
    if (contactIds.isEmpty()) return emptyMap()

    val useFlag =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && readOnlyColumnSupported != false
    val result = queryWritableRawIds(context, contactIds, useFlag)
    if (result != null) {
      if (useFlag) readOnlyColumnSupported = true
      return result
    }
    readOnlyColumnSupported = false
    return queryWritableRawIds(context, contactIds, withReadOnlyFlag = false).orEmpty()
  }

  /** Returns null when the provider rejected this projection. */
  private fun queryWritableRawIds(
    context: Context,
    contactIds: Collection<Long>,
    withReadOnlyFlag: Boolean,
  ): Map<Long, List<Long>>? {
    val projection = mutableListOf(
      ContactsContract.RawContacts._ID,
      ContactsContract.RawContacts.CONTACT_ID,
      ContactsContract.RawContacts.ACCOUNT_TYPE,
    )
    if (withReadOnlyFlag) {
      projection.add(ContactsContract.RawContacts.RAW_CONTACT_IS_READ_ONLY)
    }

    val placeholders = contactIds.joinToString(",") { "?" }
    val out = HashMap<Long, MutableList<Long>>()
    try {
      context.contentResolver.query(
        ContactsContract.RawContacts.CONTENT_URI,
        projection.toTypedArray(),
        "${ContactsContract.RawContacts.CONTACT_ID} IN ($placeholders) AND " +
          "${ContactsContract.RawContacts.DELETED} = 0",
        contactIds.map { it.toString() }.toTypedArray(),
        null,
      )?.use { cursor ->
        while (cursor.moveToNext()) {
          val accountType = cursor.getString(2)
          if (accountType != null && accountType in NON_WRITABLE_ACCOUNT_TYPES) continue
          if (withReadOnlyFlag && cursor.getInt(3) == 1) continue
          out.getOrPut(cursor.getLong(1)) { mutableListOf() }.add(cursor.getLong(0))
        }
      } ?: return null
    } catch (e: Exception) {
      if (withReadOnlyFlag) return null
      Log.w(TAG, "Batch raw contact lookup failed", e)
      return emptyMap()
    }
    return out
  }

  /**
   * Looks a contact up by phone number. Uses PHONE_LOOKUP, which applies the
   * platform's own number matching (country codes, formatting, trunk prefixes).
   */
  fun findByPhone(context: Context, phoneRaw: String): ContactRecord? {
    if (phoneRaw.isBlank()) return null
    val uri = Uri.withAppendedPath(
      ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
      Uri.encode(phoneRaw),
    )
    val projection = arrayOf(
      ContactsContract.PhoneLookup.CONTACT_ID,
      ContactsContract.PhoneLookup.DISPLAY_NAME,
      ContactsContract.PhoneLookup.NUMBER,
    )
    var record: ContactRecord? = null
    context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val contactId = cursor.getLong(0)
        record = ContactRecord(
          contactId = contactId,
          displayName = cursor.getString(1) ?: phoneRaw,
          phoneRaw = cursor.getString(2) ?: phoneRaw,
          phone = PhoneUtil.normalize(phoneRaw),
          rawContactIds = writableRawContactIds(context, contactId),
        )
      }
    }
    // Some ROMs return nothing from PHONE_LOOKUP for odd formats; fall back to
    // a data-table scan matched on normalized digits.
    return record ?: findByPhoneFallback(context, phoneRaw)
  }

  private fun findByPhoneFallback(context: Context, phoneRaw: String): ContactRecord? {
    val target = PhoneUtil.normalize(phoneRaw)
    if (target.isEmpty()) return null
    val projection = arrayOf(
      ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
      ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
      ContactsContract.CommonDataKinds.Phone.NUMBER,
    )
    context.contentResolver.query(
      ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
      projection,
      null,
      null,
      null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val number = cursor.getString(2) ?: continue
        if (PhoneUtil.normalize(number) != target) continue
        val contactId = cursor.getLong(0)
        return ContactRecord(
          contactId = contactId,
          displayName = cursor.getString(1) ?: number,
          phoneRaw = number,
          phone = target,
          rawContactIds = writableRawContactIds(context, contactId),
        )
      }
    }
    return null
  }

  /** The current provider-side display name, for verification after a write. */
  fun currentDisplayName(context: Context, contactId: Long): String? {
    val uri = ContentUris.withAppendedId(ContactsContract.Contacts.CONTENT_URI, contactId)
    context.contentResolver.query(
      uri,
      arrayOf(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY),
      null,
      null,
      null,
    )?.use { if (it.moveToFirst()) return it.getString(0) }
    return null
  }

  /**
   * RAW_CONTACT_IS_READ_ONLY is a platform constant, but it is only a *hint*
   * that the provider may expose it. Several OEM contact providers (vivo's
   * among them) ship without the column, and asking for it there fails the
   * whole query with "invalid column raw_contact_is_read_only".
   *
   * Null means "not tried yet"; once a device rejects the column we stop
   * asking for it and fall back to the account-type check alone.
   */
  @Volatile
  private var readOnlyColumnSupported: Boolean? = null

  private fun writableRawContactIds(context: Context, contactId: Long): List<Long> {
    val mayHaveFlag =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && readOnlyColumnSupported != false

    if (mayHaveFlag) {
      val ids = queryRawContactIds(context, contactId, withReadOnlyFlag = true)
      if (ids != null) {
        readOnlyColumnSupported = true
        return ids
      }
      // The provider rejected the projection; remember and retry without it.
      readOnlyColumnSupported = false
      Log.i(TAG, "Provider has no RAW_CONTACT_IS_READ_ONLY column; using account type only")
    }
    return queryRawContactIds(context, contactId, withReadOnlyFlag = false).orEmpty()
  }

  /** Returns the ids, or null when the provider rejected this projection. */
  private fun queryRawContactIds(
    context: Context,
    contactId: Long,
    withReadOnlyFlag: Boolean,
  ): List<Long>? {
    val projection = if (withReadOnlyFlag) {
      arrayOf(
        ContactsContract.RawContacts._ID,
        ContactsContract.RawContacts.ACCOUNT_TYPE,
        ContactsContract.RawContacts.RAW_CONTACT_IS_READ_ONLY,
      )
    } else {
      arrayOf(
        ContactsContract.RawContacts._ID,
        ContactsContract.RawContacts.ACCOUNT_TYPE,
      )
    }
    val ids = mutableListOf<Long>()
    try {
      context.contentResolver.query(
        ContactsContract.RawContacts.CONTENT_URI,
        projection,
        "${ContactsContract.RawContacts.CONTACT_ID} = ? AND " +
          "${ContactsContract.RawContacts.DELETED} = 0",
        arrayOf(contactId.toString()),
        null,
      )?.use { cursor ->
        while (cursor.moveToNext()) {
          val accountType = cursor.getString(1)
          if (accountType != null && accountType in NON_WRITABLE_ACCOUNT_TYPES) continue
          if (withReadOnlyFlag && cursor.getInt(2) == 1) continue
          ids.add(cursor.getLong(0))
        }
      } ?: return null
    } catch (e: Exception) {
      // An unknown column surfaces as IllegalArgumentException or
      // SQLiteException depending on the provider, so both are caught here.
      if (withReadOnlyFlag) return null
      Log.w(TAG, "Raw contact lookup failed for contact $contactId", e)
      return emptyList()
    }
    return ids
  }

  // ----------------------------------------------------------------- write

  /**
   * Writes [newName] onto every writable raw contact of [contactId].
   * Returns true if at least one raw contact was updated.
   */
  fun setDisplayName(context: Context, contactId: Long, newName: String): Boolean {
    val rawIds = writableRawContactIds(context, contactId)
    return setDisplayNameForRawContacts(context, rawIds, newName)
  }

  fun setDisplayNameForRawContacts(
    context: Context,
    rawContactIds: List<Long>,
    newName: String,
  ): Boolean {
    if (rawContactIds.isEmpty() || newName.isBlank()) return false
    val ops = ArrayList<ContentProviderOperation>()
    val mimeType = ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE

    for (rawId in rawContactIds) {
      val hasNameRow = hasStructuredNameRow(context, rawId)
      val builder = if (hasNameRow) {
        ContentProviderOperation.newUpdate(ContactsContract.Data.CONTENT_URI)
          .withSelection(
            "${ContactsContract.Data.RAW_CONTACT_ID} = ? AND ${ContactsContract.Data.MIMETYPE} = ?",
            arrayOf(rawId.toString(), mimeType),
          )
      } else {
        ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
          .withValue(ContactsContract.Data.RAW_CONTACT_ID, rawId)
          .withValue(ContactsContract.Data.MIMETYPE, mimeType)
      }
      // DISPLAY_NAME drives the aggregated name; the structured parts are
      // cleared so a stale surname cannot reappear in the rendered name.
      ops.add(
        builder
          .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, newName)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.GIVEN_NAME, newName)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.FAMILY_NAME, null)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.MIDDLE_NAME, null)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.PREFIX, null)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.SUFFIX, null)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.PHONETIC_GIVEN_NAME, null)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.PHONETIC_FAMILY_NAME, null)
          .withValue(ContactsContract.CommonDataKinds.StructuredName.PHONETIC_MIDDLE_NAME, null)
          .build(),
      )
    }

    return try {
      val results = context.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
      results.isNotEmpty()
    } catch (e: Exception) {
      // A single read-only raw contact must not fail the whole batch, so retry
      // one operation at a time.
      Log.w(TAG, "Batch rename failed, retrying individually", e)
      var anySucceeded = false
      for (op in ops) {
        try {
          context.contentResolver.applyBatch(ContactsContract.AUTHORITY, arrayListOf(op))
          anySucceeded = true
        } catch (inner: Exception) {
          Log.w(TAG, "Rename operation failed", inner)
        }
      }
      anySucceeded
    }
  }

  private fun hasStructuredNameRow(context: Context, rawContactId: Long): Boolean {
    context.contentResolver.query(
      ContactsContract.Data.CONTENT_URI,
      arrayOf(ContactsContract.Data._ID),
      "${ContactsContract.Data.RAW_CONTACT_ID} = ? AND ${ContactsContract.Data.MIMETYPE} = ?",
      arrayOf(
        rawContactId.toString(),
        ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE,
      ),
      null,
    )?.use { return it.moveToFirst() }
    return false
  }
}
