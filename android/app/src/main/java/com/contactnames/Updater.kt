package com.contactnames

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Self-updating for a sideloaded build.
 *
 * There is no store behind this app, so it checks a small JSON manifest for a
 * newer build, downloads that APK, and hands it to Android's own installer.
 * The install itself is never silent: the system always asks the user to
 * confirm, which is the behaviour we want for an app that edits contacts.
 */
object Updater {

  private const val TAG = "Updater"
  private const val CONNECT_TIMEOUT_MS = 15_000
  private const val READ_TIMEOUT_MS = 60_000
  private const val MAX_APK_BYTES = 300L * 1024 * 1024

  /** Where downloads land; inside the cache dir, so Android can reclaim it. */
  private fun updateDir(context: Context): File =
    File(context.cacheDir, "updates").apply { mkdirs() }

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
      readTimeout = READ_TIMEOUT_MS
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

  /**
   * Downloads [url] into the cache and returns the file. An existing file of
   * the same name is replaced, so a half-finished earlier attempt cannot be
   * mistaken for a complete download.
   */
  fun download(context: Context, url: String, fileName: String): File {
    val target = File(updateDir(context), sanitize(fileName))
    val partial = File(target.absolutePath + ".part")
    if (partial.exists()) partial.delete()

    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = CONNECT_TIMEOUT_MS
      readTimeout = READ_TIMEOUT_MS
      setRequestProperty("User-Agent", "Persona-Updater")
      instanceFollowRedirects = true
    }
    try {
      val code = connection.responseCode
      if (code !in 200..299) {
        throw IllegalStateException("Download failed with HTTP $code")
      }
      var written = 0L
      connection.inputStream.use { input ->
        partial.outputStream().use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            written += read
            if (written > MAX_APK_BYTES) {
              throw IllegalStateException("Update is unexpectedly large; refusing it")
            }
            output.write(buffer, 0, read)
          }
        }
      }
      if (written == 0L) throw IllegalStateException("Downloaded nothing")
      if (target.exists()) target.delete()
      if (!partial.renameTo(target)) {
        throw IllegalStateException("Could not finalise the download")
      }
      return target
    } catch (e: Exception) {
      partial.delete()
      throw e
    } finally {
      connection.disconnect()
    }
  }

  /** Keeps a manifest-supplied name from escaping the updates folder. */
  private fun sanitize(name: String): String {
    val cleaned = name.substringAfterLast('/').substringAfterLast('\\')
    return if (cleaned.endsWith(".apk") && cleaned.length in 5..128) {
      cleaned
    } else {
      "persona-update.apk"
    }
  }

  /** Android 8+ gates installs behind a per-app grant. */
  fun canInstall(context: Context): Boolean =
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      true
    } else {
      context.packageManager.canRequestPackageInstalls()
    }

  fun openInstallPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
      .setData(Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (intent.resolveActivity(context.packageManager) == null) return false
    context.startActivity(intent)
    return true
  }

  /** Hands the APK to the system installer, which asks the user to confirm. */
  fun install(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(
      context,
      "${context.packageName}.fileprovider",
      file,
    )
    val intent = Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(intent)
  }
}
