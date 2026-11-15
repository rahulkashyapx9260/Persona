package com.contactnames

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL

/**
 * Update checking for a sideloaded build.
 *
 * There is no store behind this app, so it reads a small JSON manifest to
 * learn whether a newer build exists. It deliberately stops there and opens
 * the download in a browser: installing from inside the app would need
 * REQUEST_INSTALL_PACKAGES, and that permission next to contacts access is
 * what Play Protect treats as a dropper — it blocked the install outright.
 */
object Updater {

  private const val TAG = "Updater"
  private const val CONNECT_TIMEOUT_MS = 15_000

  fun currentVersionCode(context: Context): Long =
    try {
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode
      } else {
        @Suppress("DEPRECATION")
        info.versionCode.toLong()
      }
    } catch (e: Exception) {
      Log.w(TAG, "Could not read own version", e)
      0L
    }

  fun currentVersionName(context: Context): String =
    try {
      context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
    } catch (e: Exception) {
      "?"
    }

  /** Fetches the update manifest as raw text; the JS side parses it. */
  fun fetchManifest(url: String): String {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = CONNECT_TIMEOUT_MS
      readTimeout = 30_000
      requestMethod = "GET"
      // A neutral client name: nothing identifying about the user or device.
      setRequestProperty("User-Agent", "Persona-Updater")
      instanceFollowRedirects = true
    }
    try {
      val code = connection.responseCode
      if (code !in 200..299) {
        throw IllegalStateException("Update check failed with HTTP $code")
      }
      return connection.inputStream.bufferedReader().use { it.readText() }
    } finally {
      connection.disconnect()
    }
  }

  /** Opens the release page so Android, not this app, handles installing. */
  fun openInBrowser(context: Context, url: String): Boolean {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (intent.resolveActivity(context.packageManager) == null) {
      Log.w(TAG, "No browser to open $url")
      return false
    }
    context.startActivity(intent)
    return true
  }
}
