package com.zandrix.zomi

import android.content.pm.PackageManager
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import dalvik.system.PathClassLoader
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.SourceFactory
import eu.kanade.tachiyomi.source.initSourceApiInjekt
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.online.HttpSource
import kotlinx.coroutines.runBlocking
import java.util.concurrent.ConcurrentHashMap

/**
 * Loads a real, installed Tachiyomi extension APK via reflection and calls its actual
 * getPopularManga()/getSearchManga()/getChapterList()/getPageList() — no scraping logic of our
 * own, no WebView. This is what makes the "source-api" module (ported Source/CatalogueSource/
 * HttpSource interfaces + NetworkHelper + vendored injekt DI) actually useful: the extension's
 * class references to those exact package/class names resolve against our copies at runtime.
 */
class ExtensionLoaderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ExtensionLoader"

    private val sourceCache = ConcurrentHashMap<String, List<CatalogueSource>>()

    init {
        initSourceApiInjekt(reactApplicationContext)
    }

    private fun loadSources(pkgName: String): List<CatalogueSource> {
        sourceCache[pkgName]?.let { return it }

        val pm = reactApplicationContext.packageManager
        @Suppress("DEPRECATION")
        val pkgInfo = pm.getPackageInfo(pkgName, PackageManager.GET_META_DATA)
        val appInfo = pkgInfo.applicationInfo ?: throw Exception("No ApplicationInfo for $pkgName")
        val meta = appInfo.metaData ?: throw Exception("No metadata for $pkgName")
        val classNames = meta.getString("tachiyomi.extension.class")
            ?: throw Exception("No tachiyomi.extension.class metadata for $pkgName")

        val classLoader = PathClassLoader(appInfo.sourceDir, null, this.javaClass.classLoader)

        val sources = classNames.split(";")
            .map { it.trim() }
            .map { name -> if (name.startsWith(".")) pkgName + name else name }
            .flatMap { className ->
                when (val obj = Class.forName(className, false, classLoader).getDeclaredConstructor().newInstance()) {
                    is SourceFactory -> obj.createSources()
                    is Source -> listOf(obj)
                    else -> throw Exception("Unknown source class type: ${obj.javaClass}")
                }
            }
            .filterIsInstance<CatalogueSource>()

        sourceCache[pkgName] = sources
        return sources
    }

    private fun sourceAt(pkgName: String, sourceIndex: Int): CatalogueSource {
        return loadSources(pkgName).getOrNull(sourceIndex)
            ?: throw Exception("No source at index $sourceIndex in $pkgName")
    }

    // Class.forName failures on a dynamically loaded extension are easy to misdiagnose from
    // just e.message (e.g. ClassNotFoundException's message IS the class name, with zero
    // context on WHY). Surface the full exception type + cause chain both to logcat and back
    // to the JS Promise rejection so iterating doesn't require pulling logcat every time.
    private fun describeError(tag: String, e: Throwable): String {
        val sb = StringBuilder()
        var cur: Throwable? = e
        var depth = 0
        while (cur != null && depth < 6) {
            sb.append(if (depth == 0) "" else "\nCaused by: ")
            sb.append(cur.javaClass.name).append(": ").append(cur.message)
            cur = cur.cause
            depth++
        }
        val full = sb.toString()
        Log.e("ExtensionLoader", "[$tag] $full", e)
        return full
    }

    private fun SManga.toWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("url", url)
        putString("title", title)
        putString("artist", artist)
        putString("author", author)
        putString("description", description)
        putString("genre", genre)
        putInt("status", status)
        putString("thumbnailUrl", thumbnail_url)
        putBoolean("initialized", initialized)
    }

    private fun SChapter.toWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("url", url)
        putString("name", name)
        putDouble("dateUpload", date_upload.toDouble())
        putDouble("chapterNumber", chapter_number.toDouble())
        putString("scanlator", scanlator)
    }

    @ReactMethod
    fun listSources(pkgName: String, promise: Promise) {
        Thread {
            try {
                val sources = loadSources(pkgName)
                val arr = Arguments.createArray()
                sources.forEachIndexed { index, source ->
                    arr.pushMap(
                        Arguments.createMap().apply {
                            putInt("index", index)
                            putString("name", source.name)
                            putString("lang", source.lang)
                            putDouble("id", source.id.toDouble())
                        },
                    )
                }
                promise.resolve(arr)
            } catch (e: Throwable) {
                promise.reject("ERROR", describeError("listSources", e), e)
            }
        }.start()
    }

    @ReactMethod
    fun getPopularManga(pkgName: String, sourceIndex: Int, page: Int, promise: Promise) {
        Thread {
            try {
                val source = sourceAt(pkgName, sourceIndex)
                val result = runBlocking { source.getPopularManga(page) }
                val arr = Arguments.createArray()
                result.mangas.forEach { arr.pushMap(it.toWritableMap()) }
                promise.resolve(
                    Arguments.createMap().apply {
                        putArray("mangas", arr)
                        putBoolean("hasNextPage", result.hasNextPage)
                    },
                )
            } catch (e: Throwable) {
                promise.reject("ERROR", describeError("getPopularManga", e), e)
            }
        }.start()
    }

    @ReactMethod
    fun getSearchManga(pkgName: String, sourceIndex: Int, page: Int, query: String, promise: Promise) {
        Thread {
            try {
                val source = sourceAt(pkgName, sourceIndex)
                val result = runBlocking { source.getSearchManga(page, query, FilterList()) }
                val arr = Arguments.createArray()
                result.mangas.forEach { arr.pushMap(it.toWritableMap()) }
                promise.resolve(
                    Arguments.createMap().apply {
                        putArray("mangas", arr)
                        putBoolean("hasNextPage", result.hasNextPage)
                    },
                )
            } catch (e: Throwable) {
                promise.reject("ERROR", describeError("getSearchManga", e), e)
            }
        }.start()
    }

    @ReactMethod
    fun getLatestUpdates(pkgName: String, sourceIndex: Int, page: Int, promise: Promise) {
        Thread {
            try {
                val source = sourceAt(pkgName, sourceIndex)
                val result = runBlocking { source.getLatestUpdates(page) }
                val arr = Arguments.createArray()
                result.mangas.forEach { arr.pushMap(it.toWritableMap()) }
                promise.resolve(
                    Arguments.createMap().apply {
                        putArray("mangas", arr)
                        putBoolean("hasNextPage", result.hasNextPage)
                    },
                )
            } catch (e: Throwable) {
                promise.reject("ERROR", describeError("getLatestUpdates", e), e)
            }
        }.start()
    }

    @ReactMethod
    fun getChapterList(pkgName: String, sourceIndex: Int, mangaUrl: String, promise: Promise) {
        Thread {
            try {
                val source = sourceAt(pkgName, sourceIndex)
                val manga = SManga.create().apply { url = mangaUrl }
                val result = runBlocking { source.getChapterList(manga) }
                val arr = Arguments.createArray()
                result.forEach { arr.pushMap(it.toWritableMap()) }
                promise.resolve(arr)
            } catch (e: Throwable) {
                promise.reject("ERROR", describeError("getChapterList", e), e)
            }
        }.start()
    }

    @ReactMethod
    fun getPageList(pkgName: String, sourceIndex: Int, chapterUrl: String, promise: Promise) {
        Thread {
            try {
                val source = sourceAt(pkgName, sourceIndex)
                val chapter = SChapter.create().apply { url = chapterUrl }
                val result = runBlocking { source.getPageList(chapter) }
                val arr = Arguments.createArray()
                result.forEach { page ->
                    arr.pushMap(
                        Arguments.createMap().apply {
                            putInt("index", page.index)
                            putString("url", page.url)
                            putString("imageUrl", page.imageUrl)
                        },
                    )
                }
                promise.resolve(arr)
            } catch (e: Throwable) {
                promise.reject("ERROR", describeError("getPageList", e), e)
            }
        }.start()
    }

    @ReactMethod
    fun getImageUrl(pkgName: String, sourceIndex: Int, pageUrl: String, pageIndex: Int, promise: Promise) {
        Thread {
            try {
                val source = sourceAt(pkgName, sourceIndex)
                val httpSource = source as? HttpSource
                    ?: throw Exception("Source is not an HttpSource, can't resolve image url")
                val page = Page(index = pageIndex, url = pageUrl)
                val resolvedUrl = runBlocking { httpSource.getImageUrl(page) }
                promise.resolve(resolvedUrl)
            } catch (e: Throwable) {
                promise.reject("ERROR", describeError("getImageUrl", e), e)
            }
        }.start()
    }
}
