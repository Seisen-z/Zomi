package com.zandrix.zomi

import android.content.Context
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View.MeasureSpec
import com.davemorrissey.labs.subscaleview.SubsamplingScaleImageView

// A plain single tap (confirmed as not the first half of a double-tap) is forwarded to
// onSingleTap so JS can run its own tap-zone page-turn logic — same split real Tachiyomi uses
// (SubsamplingScaleImageView owns pan/pinch/double-tap-zoom internally; the reader viewer layer
// separately watches for plain taps to turn pages). Feeding a parallel GestureDetector the same
// touch stream, without consuming it, is what lets both coexist without fighting each other.
class TachiyomiSubsamplingImageView(context: Context) : SubsamplingScaleImageView(context) {
    var onSingleTap: ((x: Float, y: Float) -> Unit)? = null
    var onSwipe: ((direction: String) -> Unit)? = null

    private val measureAndLayout = Runnable {
        measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
        )
        layout(left, top, right, bottom)
    }

    override fun requestLayout() {
        super.requestLayout()
        post(measureAndLayout)
    }

    private val tapDetector = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                // e.x/e.y are raw device pixels (Android MotionEvent), but the JS side computes
                // tap zones against areaSize from RN's onLayout, which is in dp — without this
                // conversion, nx/ny come out inflated by the display density (e.g. ~2.6x on a
                // xxhdpi screen) and almost always land past the 0.66 threshold, so every tap
                // resolves to the rightmost zone regardless of where the screen was actually
                // tapped.
                val density = resources.displayMetrics.density
                onSingleTap?.invoke(e.x / density, e.y / density)
                return false
            }

            // Only recognized at the view's resting (unzoomed) scale — while zoomed in, a
            // horizontal drag pans the image instead (SubsamplingScaleImageView's own touch
            // handling, untouched by this parallel detector). Mirrors real Tachiyomi's paged
            // viewers, where swipe-to-turn only applies at the default zoom level.
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                if (e1 == null) return false
                if (scale > minScale * 1.01f) return false
                val dx = e2.x - e1.x
                val dy = e2.y - e1.y
                if (kotlin.math.abs(dx) < kotlin.math.abs(dy) * 1.5f) return false
                if (kotlin.math.abs(velocityX) < 800f) return false
                onSwipe?.invoke(if (dx < 0) "left" else "right")
                return false
            }
        },
    )

    override fun onTouchEvent(event: MotionEvent): Boolean {
        tapDetector.onTouchEvent(event)
        return super.onTouchEvent(event)
    }
}
