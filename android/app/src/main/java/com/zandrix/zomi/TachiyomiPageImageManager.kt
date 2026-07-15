package com.zandrix.zomi

import android.net.Uri
import android.util.Log
import com.davemorrissey.labs.subscaleview.ImageSource
import com.davemorrissey.labs.subscaleview.SubsamplingScaleImageView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

// Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/ReaderPageImageView.kt —
// the same subsampling-scale-image-view library real Tachiyomi uses for pages, so a huge/tall raw
// scan is tile-decoded at full resolution instead of RN's <Image> downsampling the whole bitmap
// into memory (which is what was making pages look blurry compared to the real app). Fabric's
// interop layer still supports this "old style" SimpleViewManager, so no Codegen spec is needed.
class TachiyomiPageImageManager : SimpleViewManager<SubsamplingScaleImageView>() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private val loadJobs = HashMap<Int, Job>()

    override fun getName() = "TachiyomiPageImage"

    override fun createViewInstance(reactContext: ThemedReactContext): SubsamplingScaleImageView {
        return TachiyomiSubsamplingImageView(reactContext).apply {
            setMinimumTileDpi(180)
            setPanLimit(SubsamplingScaleImageView.PAN_LIMIT_INSIDE)
            setDoubleTapZoomStyle(SubsamplingScaleImageView.ZOOM_FOCUS_CENTER)
            setMinimumScaleType(SubsamplingScaleImageView.SCALE_TYPE_CENTER_INSIDE)
            onSingleTap = { x, y ->
                emitEvent(this, "onSingleTap", Arguments.createMap().apply {
                    putDouble("x", x.toDouble())
                    putDouble("y", y.toDouble())
                })
            }
            onSwipe = { direction ->
                emitEvent(this, "onSwipe", Arguments.createMap().apply {
                    putString("direction", direction)
                })
            }
            setOnImageEventListener(
                object : SubsamplingScaleImageView.DefaultOnImageEventListener() {
                    override fun onReady() {
                        maxScale = scale * 5f
                        setDoubleTapZoomScale(scale * 2.5f)
                        emitEvent(this@apply, "onLoad", Arguments.createMap().apply {
                            putInt("width", sWidth)
                            putInt("height", sHeight)
                        })
                    }

                    override fun onImageLoadError(e: Exception) {
                        Log.e("TachiyomiPageImage", "Decode failed", e)
                        emitEvent(this@apply, "onError")
                    }
                },
            )
        }
    }

    // Webtoon/long-strip pages (fitWidth=true) size their RN box to the image's own aspect ratio,
    // so CENTER_INSIDE (the paged reader's default, wanting the whole page visible while
    // zoomable) and CENTER_CROP should look identical there — box ratio == image ratio. But any
    // small mismatch between the JS-computed ratio and the native decoder's real pixel ratio
    // leaves a visible pillarboxed gap under CENTER_INSIDE, whereas CENTER_CROP just crops the
    // (sub-pixel) overflow instead, so long-strip pages never show black bars.
    @ReactProp(name = "fitWidth")
    fun setFitWidth(view: SubsamplingScaleImageView, fitWidth: Boolean) {
        view.setMinimumScaleType(
            if (fitWidth) SubsamplingScaleImageView.SCALE_TYPE_CENTER_CROP
            else SubsamplingScaleImageView.SCALE_TYPE_CENTER_INSIDE,
        )
    }

    @ReactProp(name = "source")
    fun setSource(view: SubsamplingScaleImageView, uri: String?) {
        if (uri.isNullOrEmpty()) return
        loadJobs[view.id]?.cancel()
        loadJobs[view.id] = scope.launch {
            try {
                val file = withContext(Dispatchers.IO) { downloadToCache(view, uri) }
                view.setImage(ImageSource.uri(Uri.fromFile(file)))
            } catch (e: Exception) {
                Log.e("TachiyomiPageImage", "Failed to fetch $uri", e)
                emitEvent(view, "onError")
            }
        }
    }

    override fun onDropViewInstance(view: SubsamplingScaleImageView) {
        loadJobs.remove(view.id)?.cancel()
        super.onDropViewInstance(view)
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return MapBuilder.of(
            "onLoad", MapBuilder.of("registrationName", "onLoad"),
            "onError", MapBuilder.of("registrationName", "onError"),
            "onSingleTap", MapBuilder.of("registrationName", "onSingleTap"),
            "onSwipe", MapBuilder.of("registrationName", "onSwipe"),
        )
    }

    // getJSModule(RCTEventEmitter) is the legacy Bridge-era dispatch path — it throws
    // (IllegalArgumentException, silently swallowed as a SoftException) under Fabric's Bridgeless
    // mode, which is why onLoad/onError/onSingleTap were never actually reaching JS. This is the
    // Fabric-compatible replacement: route through the surface's own EventDispatcher instead.
    private fun emitEvent(view: SubsamplingScaleImageView, name: String, data: WritableMap = Arguments.createMap()) {
        val reactContext = view.context as ThemedReactContext
        val surfaceId = UIManagerHelper.getSurfaceId(view)
        val eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, view.id) ?: return
        eventDispatcher.dispatchEvent(NativeUIEvent(surfaceId, view.id, name, data))
    }

    private class NativeUIEvent(
        surfaceId: Int,
        viewId: Int,
        private val name: String,
        private val data: WritableMap,
    ) : Event<NativeUIEvent>(surfaceId, viewId) {
        override fun getEventName() = name
        override fun getEventData() = data
    }

    // Pages are remote https URLs, but SubsamplingScaleImageView's tiled BitmapRegionDecoder needs
    // a local file/content URI to seek within — same reason real Tachiyomi's downloader caches
    // pages to disk before ever handing them to this view.
    private fun downloadToCache(view: SubsamplingScaleImageView, uri: String): File {
        // Downloaded chapters pass a file:// uri that's already local (see getDownloadedPageUri in
        // downloader.ts) — URL(uri).openConnection() below only handles http(s), and casting a
        // file:// connection to HttpURLConnection throws ClassCastException, which was silently
        // swallowed as onError and rendered the page blank. No fetch/cache needed for a local file.
        if (uri.startsWith("file://")) {
            return File(Uri.parse(uri).path!!)
        }

        val digest = MessageDigest.getInstance("MD5").digest(uri.toByteArray())
        val hash = digest.joinToString("") { "%02x".format(it) }
        val cacheFile = File(view.context.cacheDir, "reader_pages/$hash")
        if (cacheFile.exists() && cacheFile.length() > 0) return cacheFile

        cacheFile.parentFile?.mkdirs()
        val connection = URL(uri).openConnection() as HttpURLConnection
        connection.setRequestProperty(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        connection.connectTimeout = 15000
        connection.readTimeout = 30000
        try {
            connection.inputStream.use { input ->
                cacheFile.outputStream().use { output -> input.copyTo(output) }
            }
        } catch (e: Exception) {
            cacheFile.delete()
            throw e
        } finally {
            connection.disconnect()
        }
        return cacheFile
    }
}
