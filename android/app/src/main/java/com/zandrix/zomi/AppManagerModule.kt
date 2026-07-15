package com.zandrix.zomi

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.view.WindowManager

class AppManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AppManager"

  // Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/ReaderActivity.kt's
  // "Keep screen on" preference — same FLAG_KEEP_SCREEN_ON window flag approach.
  @ReactMethod
  fun setKeepScreenOn(enabled: Boolean) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      if (enabled) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      } else {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }

  @ReactMethod
  fun isPackageInstalled(packageName: String, promise: Promise) {
    try {
      reactApplicationContext.packageManager.getPackageInfo(packageName, 0)
      promise.resolve(true)
    } catch (e: PackageManager.NameNotFoundException) {
      promise.resolve(false)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  // Backs the More screen's "Wi-Fi Only" download setting — checked before starting each chapter
  // download in downloader.ts.
  @ReactMethod
  fun isWifiConnected(promise: Promise) {
    try {
      val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val network = cm.activeNetwork
      val capabilities = network?.let { cm.getNetworkCapabilities(it) }
      promise.resolve(capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ?: false)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  // Android has no silent-uninstall API for a non-device-owner app — this launches the system's
  // own uninstall confirmation dialog (ACTION_DELETE), same as tapping "Uninstall" from Settings.
  @ReactMethod
  fun uninstallPackage(packageName: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }

  @ReactMethod
  fun getInstalledPackages(promise: Promise) {
    try {
      val packages = reactApplicationContext.packageManager.getInstalledPackages(0)
      val list = Arguments.createArray()
      for (info in packages) {
        list.pushString(info.packageName)
      }
      promise.resolve(list)
    } catch (e: Exception) {
      promise.reject(e)
    }
  }
}
