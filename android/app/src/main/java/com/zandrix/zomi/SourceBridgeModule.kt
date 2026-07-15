package com.zandrix.zomi

import android.content.pm.PackageManager
import com.facebook.react.bridge.*
import org.json.JSONObject

/**
 * Reads metadata from installed Tachiyomi extension APKs (package name, base URL, source name, lang)
 * without trying to load any extension Kotlin classes. The actual web browsing is done on the
 * JavaScript side via a WebView.
 */
class SourceBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SourceBridge"

    @ReactMethod
    fun getSourceInfo(pkgName: String, promise: Promise) {
        Thread {
            try {
                val context = reactApplicationContext
                @Suppress("DEPRECATION")
                val pkgInfo = context.packageManager.getPackageInfo(pkgName, PackageManager.GET_META_DATA)
                val appInfo = pkgInfo?.applicationInfo
                val meta = appInfo?.metaData

                val result = JSONObject()
                // Package name is the ID
                result.put("pkgName", pkgName)
                // Extract label as source name (strips "Tachiyomi: " prefix like ExtensionLoader does)
                val label = try {
                    context.packageManager.getApplicationLabel(appInfo!!).toString()
                        .removePrefix("Tachiyomi: ")
                } catch (_: Exception) { pkgName }
                result.put("name", label)

                // Lang is the last segment of the package name: eu.kanade.tachiyomi.extension.{lang}.{source}
                val segments = pkgName.split(".")
                val lang = if (segments.size >= 5) segments[4] else "en"
                result.put("lang", lang)

                // Try to read baseUrl from metadata (some extensions expose it)
                val baseUrl = meta?.getString("tachiyomi.extension.baseUrl")
                    ?: meta?.getString("tachiyomi.extension.url")
                    ?: deriveBaseUrl(pkgName)
                result.put("baseUrl", baseUrl ?: "")
                result.put("supportsLatest", false)

                promise.resolve(result.toString())
            } catch (e: Exception) {
                promise.reject("ERROR", e.message ?: "Unknown error")
            }
        }.start()
    }

    /**
     * Derives the most likely base URL from known extension package names.
     * This handles the common case where the metadata doesn't expose a baseUrl key.
     */
    private fun deriveBaseUrl(pkgName: String): String? {
        return when {
            pkgName.contains("asurascans") || pkgName.contains("asura") ->
                "https://asuracomic.net"
            pkgName.contains("mangadex") ->
                "https://mangadex.org"
            pkgName.contains("mangaplus") ->
                "https://mangaplus.shueisha.co.jp"
            pkgName.contains("webtoons") ->
                "https://www.webtoons.com"
            pkgName.contains("tapas") ->
                "https://tapas.io"
            pkgName.contains("batoto") || pkgName.contains("bato") ->
                "https://bato.to"
            pkgName.contains("mangahere") ->
                "https://www.mangahere.cc"
            pkgName.contains("mangakakalot") ->
                "https://mangakakalot.com"
            pkgName.contains("manhwatop") ->
                "https://manhwatop.com"
            pkgName.contains("reaperscans") ->
                "https://reaperscans.com"
            pkgName.contains("flamescans") ->
                "https://flamescans.org"
            pkgName.contains("luminousscans") ->
                "https://luminousscans.com"
            pkgName.contains("void") ->
                "https://void-scans.com"
            else -> null
        }
    }
}
