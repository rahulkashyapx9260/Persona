package com.contactnames

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log

/**
 * Fired at each slot boundary. Reconciles every tracked contact with the
 * currently active slot and arms the next alarm.
 */
class AlarmReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    Log.i(TAG, "Alarm received: ${intent.action}")
    reconcileAsync(context, goAsync(), TAG)
  }

  companion object {
    private const val TAG = "AlarmReceiver"

    /**
     * Shared by the alarm and boot receivers. Contacts writes talk to a content
     * provider, so they must leave the broadcast thread; goAsync keeps the
     * process alive until the work finishes.
     */
    fun reconcileAsync(
      context: Context,
      pendingResult: PendingResult?,
      tag: String,
      source: String = NameScheduler.SOURCE_ALARM,
    ) {
      val appContext = context.applicationContext

      if (!hasContactsPermissions(appContext)) {
        Log.w(tag, "Contacts permission revoked; skipping reconcile")
        pendingResult?.finish()
        return
      }

      Thread {
        try {
          Log.i(tag, "Reconcile done: ${NameScheduler.applyNow(appContext, source)}")
        } catch (e: Exception) {
          Log.e(tag, "Reconcile failed", e)
          // Keep the alarm chain alive even if a rename failed.
          runCatching { NameScheduler.rescheduleNext(appContext) }
        } finally {
          pendingResult?.finish()
        }
      }.start()
    }

    fun hasContactsPermissions(context: Context): Boolean {
      val read = context.checkSelfPermission(Manifest.permission.READ_CONTACTS)
      val write = context.checkSelfPermission(Manifest.permission.WRITE_CONTACTS)
      return read == PackageManager.PERMISSION_GRANTED && write == PackageManager.PERMISSION_GRANTED
    }
  }
}
