package com.contactnames

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Posts a notification when a contact is actually renamed.
 *
 * Both gates are checked before posting: the user's in-app toggle and, on
 * Android 13+, the runtime POST_NOTIFICATIONS grant. The alarm receiver calls
 * this with no React context alive, so nothing here may touch JS.
 */
object Notifier {

  private const val TAG = "Notifier"

  /**
   * Android freezes a channel's importance at creation, so raising it needs a
   * new id. The first channel was IMPORTANCE_LOW, which posts silently into
   * the shade with no sound and no heads-up banner — the change happened but
   * nobody saw it. [OLD_CHANNEL_ID] is deleted so no stale entry is left in
   * the system settings.
   */
  private const val CHANNEL_ID = "name_changes_v2"
  private const val OLD_CHANNEL_ID = "name_changes"
  private const val NOTIFICATION_ID = 4310

  fun enabled(context: Context): Boolean =
    ContactStore.get(context).getSetting(ContactStore.KEY_NOTIFICATIONS, "1") == "1"

  fun setEnabled(context: Context, value: Boolean) {
    ContactStore.get(context).setSetting(ContactStore.KEY_NOTIFICATIONS, if (value) "1" else "0")
  }

  fun hasPermission(context: Context): Boolean =
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      true
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    }

  /**
   * Summarises one reconcile pass. [changes] is each "from -> to" pair that
   * was written; an empty list posts nothing.
   */
  fun notifyChanges(context: Context, changes: List<Pair<String, String>>) {
    if (changes.isEmpty()) return
    if (!enabled(context)) {
      Log.i(TAG, "Notifications switched off in app; not posting")
      return
    }
    if (!hasPermission(context)) {
      Log.w(TAG, "POST_NOTIFICATIONS not granted; not posting")
      return
    }

    ensureChannel(context)

    val title = if (changes.size == 1) {
      val (from, to) = changes[0]
      "$from is now $to"
    } else {
      "${changes.size} contacts renamed"
    }
    val body = changes.joinToString(", ") { (from, to) -> "$from → $to" }

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      // HIGH so the change actually surfaces as a banner rather than sliding
      // silently into the shade.
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setContentIntent(openAppIntent(context))

    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
      Log.i(TAG, "Posted: $title")
    } catch (e: SecurityException) {
      // The grant was revoked between the check and the post; nothing to do.
      Log.w(TAG, "Notification refused", e)
    }
  }

  private fun openAppIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) ?: return null
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    // Drop the silent first-generation channel if it is still around.
    runCatching { manager.deleteNotificationChannel(OLD_CHANNEL_ID) }
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Name changes",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Posted when a scheduled contact name is applied."
      setShowBadge(true)
      enableVibration(true)
    }
    manager.createNotificationChannel(channel)
  }
}
