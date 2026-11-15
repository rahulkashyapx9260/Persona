package com.contactnames

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Alarms do not survive a reboot, an app update, or a clock change, so each of
 * those events re-applies the current slot and re-arms the alarm chain.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    Log.i(TAG, "Received $action; rescheduling")

    when (action) {
      Intent.ACTION_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON",
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      -> AlarmReceiver.reconcileAsync(context, goAsync(), TAG, NameScheduler.SOURCE_BOOT)
      else -> Unit
    }
  }

  companion object {
    private const val TAG = "BootReceiver"
  }
}
