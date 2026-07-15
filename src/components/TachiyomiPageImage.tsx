import React, { useEffect, useState } from 'react';
import { ActivityIndicator, NativeSyntheticEvent, StyleSheet, View, ViewStyle, requireNativeComponent } from 'react-native';
import { useThemeColors } from '../theme/useThemeColors';

interface NativeTapEvent {
  x: number;
  y: number;
}

interface NativeLoadEvent {
  width: number;
  height: number;
}

interface NativeSwipeEvent {
  direction: 'left' | 'right';
}

interface NativeTachiyomiPageImageProps {
  style?: ViewStyle;
  source: string;
  fitWidth?: boolean;
  onLoad?: (event: NativeSyntheticEvent<NativeLoadEvent>) => void;
  onError?: () => void;
  onSingleTap?: (event: NativeSyntheticEvent<NativeTapEvent>) => void;
  onSwipe?: (event: NativeSyntheticEvent<NativeSwipeEvent>) => void;
}

// Bridges to TachiyomiPageImageManager.kt (android/app/src/main/java/com/zandrix/zomi) — the same
// subsampling-scale-image-view library real Tachiyomi's reader uses, so pages are tile-decoded at
// full resolution (with real pinch/pan/double-tap zoom built into the native view itself) instead
// of RN's <Image> downsampling the whole bitmap and losing quality on tall/narrow raw scans.
const NativeTachiyomiPageImage =
  requireNativeComponent<NativeTachiyomiPageImageProps>('TachiyomiPageImage');

// Same placeholder ratio ReaderPageImage used before a real size is known — avoids flashing the
// page at the wrong shape momentarily.
const DEFAULT_PAGE_ASPECT_RATIO = 0.7;

export function TachiyomiPageImage({
  style,
  source,
  onSingleTap,
  onSwipe,
  fitWidth = false,
  initialRatio,
}: {
  style?: ViewStyle;
  source: string;
  onSingleTap?: (x: number, y: number) => void;
  // Fired on a fast, mostly-horizontal fling at the view's default (unzoomed) scale — see
  // TachiyomiSubsamplingImageView.kt's parallel GestureDetector.onFling.
  onSwipe?: (direction: 'left' | 'right') => void;
  // Long strip pages have no fixed height from the reader chrome — like ReaderPageImage's old
  // webtoon path, this sizes the box to the image's own aspect ratio (full width, natural height)
  // once the native view reports it, instead of filling a fixed-size box.
  fitWidth?: boolean;
  // Some sources report each page's real width/height up front (SourcePage.width/height) — pass
  // that ratio here so the box is the *correct* shape from the very first frame. Without it, a
  // page has to wait for the native view's own decode to report back before its box stops
  // guessing at a normal page's proportions, and a raw scan that's actually very tall/narrow
  // pillarboxes hard in the meantime.
  initialRatio?: number;
}) {
  const colors = useThemeColors();
  const [loaded, setLoaded] = useState(false);
  const [ratio, setRatio] = useState<number | null>(initialRatio ?? null);

  useEffect(() => {
    setLoaded(false);
    setRatio(initialRatio ?? null);
  }, [source, initialRatio]);

  const sizeStyle = fitWidth ? { width: '100%' as const, aspectRatio: ratio ?? DEFAULT_PAGE_ASPECT_RATIO } : undefined;

  return (
    <View style={[style, sizeStyle, styles.wrap]}>
      <NativeTachiyomiPageImage
        style={StyleSheet.absoluteFill}
        source={source}
        fitWidth={fitWidth}
        onLoad={(e) => {
          setLoaded(true);
          if (fitWidth) setRatio(e.nativeEvent.width / e.nativeEvent.height);
        }}
        onError={() => setLoaded(true)}
        onSingleTap={(e) => onSingleTap?.(e.nativeEvent.x, e.nativeEvent.y)}
        onSwipe={(e) => onSwipe?.(e.nativeEvent.direction)}
      />
      {!loaded && (
        <View style={[StyleSheet.absoluteFill, styles.loading]}>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
});
