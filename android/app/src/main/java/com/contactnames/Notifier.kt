package com.contactnames

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
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

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      // Tints the small icon and the app name line in the shade.
      .setColor(ContextCompat.getColor(context, R.color.ic_launcher_background))
      .setSubText("Persona")
      // HIGH so the change actually surfaces as a banner rather than sliding
      // silently into the shade.
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
      .setAutoCancel(true)
      .setContentIntent(openAppIntent(context))

    if (changes.size == 1) {
      // The new name is the headline, because that is what the phone now
      // shows; the old one is the supporting detail.
      val (from, to) = changes[0]
      builder
        .setContentTitle(to)
        .setContentText("Was $from")
        .setLargeIcon(avatarBitmap(context, to))
        .setStyle(
          NotificationCompat.BigTextStyle()
            .bigText("Was $from")
            .setSummaryText("Name changed"),
        )
    } else {
      val style = NotificationCompat.InboxStyle()
        .setBigContentTitle("${changes.size} contacts renamed")
      for ((from, to) in changes.take(6)) {
        style.addLine("$from  →  $to")
      }
      if (changes.size > 6) {
        style.setSummaryText("+${changes.size - 6} more")
      }
      builder
        .setContentTitle("${changes.size} contacts renamed")
        .setContentText(changes.joinToString(", ") { (_, to) -> to })
        .setStyle(style)
    }

    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
      Log.i(TAG, "Posted ${changes.size} change(s)")
    } catch (e: SecurityException) {
      // The grant was revoked between the check and the post; nothing to do.
      Log.w(TAG, "Notification refused", e)
    }
  }

  /**
   * A round avatar carrying the contact's initials, used as the large icon.
   *
   * Android has no built-in way to show "who" a notification is about unless
   * you give it an image, and these contacts have no photo this app can rely
   * on. The tint is derived from the name, so the same contact keeps the same
   * colour every time — matching the avatars inside the app.
   */
  private fun avatarBitmap(context: Context, name: String): Bitmap {
    val size = (context.resources.displayMetrics.density * 64).toInt().coerceAtLeast(96)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val radius = size / 2f

    val hue = hueFor(name)
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.HSVToColor(floatArrayOf(hue, 0.55f, 0.85f))
    }
    canvas.drawCircle(radius, radius, radius, background)

    val initials = initialsOf(name)
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = size * 0.4f
      textAlign = Paint.Align.CENTER
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    // Centre on the glyph box rather than the baseline, so letters with no
    // descender do not sit low in the circle.
    val bounds = Rect()
    text.getTextBounds(initials, 0, initials.length, bounds)
    canvas.drawText(initials, radius, radius + bounds.height() / 2f, text)

    return bitmap
  }

  private fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val letters = parts.take(2).mapNotNull { it.firstOrNull() }.joinToString("")
    return if (letters.isEmpty()) "#" else letters.uppercase()
  }

  /** Stable 0-359 hue from a string, so colours never shuffle. */
  private fun hueFor(value: String): Float {
    var hash = 0
    for (char in value) {
      hash = (hash * 31 + char.code) % 360
    }
    return ((hash + 360) % 360).toFloat()
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
