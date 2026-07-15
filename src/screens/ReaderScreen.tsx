import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, LayoutChangeEvent, GestureResponderEvent, NativeSyntheticEvent, NativeScrollEvent, BackHandler, Animated, Alert, NativeModules, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { ArrowLeft, Settings2, BookOpen, Sun, SunMedium, Moon } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { Manga } from '../data/models';
import { getChaptersByMangaId, setLastPageRead, markChapterRead } from '../data/repository';
import { getSourceById } from '../data/sources/registry';
import { SourcePage } from '../data/sources/types';
import { getDownloadedPageCount, getDownloadedPageUri, isChapterDownloaded } from '../data/downloader';
import { TachiyomiPageImage } from '../components/TachiyomiPageImage';
import {
  ReadingMode,
  TapZoneMode,
  InvertMode,
  ScaleType,
  BackgroundMode,
  getReaderPreferences,
  setReaderPreferences,
} from '../data/readerPreferences';
import { getAppPreferences, PAGE_TURN_DURATIONS } from '../data/appPreferences';
import { syncTrackersForManga } from '../data/trackers/trackSync';

interface ReaderScreenProps {
  manga: Manga;
  chapterIndex: number;
  onBack: () => void;
}

// Used only when the manga's source isn't a real registered Zomi source (e.g. the demo
// catalog) — there's nothing to fetch real pages from, so show a placeholder count/color.
const PLACEHOLDER_PAGE_COUNT = 20;

const bgColors: Record<BackgroundMode, string> = {
  white: '#ffffff',
  sepia: '#f8f0e3',
  dark: '#0a0a0a',
};

const pageColors = ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#2d132c', '#1a1a2e', '#0d0d0d', '#1a1a2e'];

const readingModes: { key: ReadingMode; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'ltr', label: 'Paged (LTR)' },
  { key: 'rtl', label: 'Paged (RTL)' },
  { key: 'vertical', label: 'Paged (vertical)' },
  { key: 'webtoon', label: 'Long strip' },
  { key: 'continuous-vertical', label: 'Long strip with gaps' },
];

const tapZoneModes: { key: TapZoneMode; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'l-shaped', label: 'L shaped' },
  { key: 'kindlish', label: 'Kindle-ish' },
  { key: 'edge', label: 'Edge' },
  { key: 'right-left', label: 'Right and Left' },
  { key: 'disabled', label: 'Disabled' },
];

const invertModes: { key: InvertMode; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'horizontal', label: 'Horizontal' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'both', label: 'Both' },
];

const scaleTypes: { key: ScaleType; label: string }[] = [
  { key: 'fit-screen', label: 'Fit screen' },
  { key: 'fit-width', label: 'Fit width' },
  { key: 'fit-height', label: 'Fit height' },
];

function isWebtoonMode(mode: ReadingMode): boolean {
  return mode === 'webtoon' || mode === 'continuous-vertical';
}

// "Default" resolves to whatever the reading direction actually is for navigation purposes —
// real Tachiyomi's DEFAULT reading mode falls back to the library-wide default (right-to-left).
function resolveEffectiveMode(mode: ReadingMode): ReadingMode {
  return mode === 'default' ? 'rtl' : mode;
}

// Mirrors PagerConfig.updateNavigation / WebtoonConfig.updateNavigation: "Default" tap zones
// are L-shaped for the vertical pager and Right-and-Left for every other pager mode.
function resolveTapZoneMode(setting: TapZoneMode, mode: ReadingMode): TapZoneMode {
  if (setting !== 'default') return setting;
  return mode === 'vertical' ? 'l-shaped' : 'right-left';
}

type ZoneAction = 'prev' | 'next' | 'menu' | 'left' | 'right';

// Region geometry ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/navigation/*.kt
// (LNavigation, KindlishNavigation, EdgeNavigation, RightAndLeftNavigation). nx/ny are normalized
// tap coordinates in [0,1] within the reading area, already adjusted for "invert tap zones".
function resolveZoneAction(mode: TapZoneMode, nx: number, ny: number): ZoneAction {
  switch (mode) {
    case 'l-shaped':
      if (ny <= 0.33) return 'prev';
      if (ny >= 0.66) return 'next';
      if (nx <= 0.33) return 'prev';
      if (nx >= 0.66) return 'next';
      return 'menu';
    case 'kindlish':
      if (ny <= 0.33) return 'menu';
      return nx <= 0.33 ? 'prev' : 'next';
    case 'edge':
      if (nx <= 0.33 || nx >= 0.66) return 'next';
      return ny >= 0.66 ? 'prev' : 'menu';
    case 'right-left':
      if (nx <= 0.33) return 'left';
      if (nx >= 0.66) return 'right';
      return 'menu';
    case 'disabled':
      return 'menu';
    default:
      return 'menu';
  }
}

export function ReaderScreen({ manga, chapterIndex, onBack }: ReaderScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [showUI, setShowUI] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  // Global reader preferences (MMKV-backed, see src/data/readerPreferences.ts) — loaded once via
  // the lazy useState initializer, same as real Tachiyomi: these apply to every manga, not just
  // this one, and survive an app restart. Persisted back on every change by the effect below.
  const initialPrefs = useMemo(getReaderPreferences, []);
  const [readingMode, setReadingMode] = useState<ReadingMode>(initialPrefs.readingMode);
  const [tapZoneMode, setTapZoneMode] = useState<TapZoneMode>(initialPrefs.tapZoneMode);
  const [invertMode, setInvertMode] = useState<InvertMode>(initialPrefs.invertMode);
  const [scaleType, setScaleType] = useState<ScaleType>(initialPrefs.scaleType);
  const [bgMode, setBgMode] = useState<BackgroundMode>(initialPrefs.bgMode);
  const [showPageNumber, setShowPageNumber] = useState(initialPrefs.showPageNumber);
  const [confirmExit, setConfirmExit] = useState(initialPrefs.confirmExit);
  const [keepScreenOn, setKeepScreenOn] = useState(initialPrefs.keepScreenOn);
  const [currentChapter, setCurrentChapter] = useState(chapterIndex);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  const [realPages, setRealPages] = useState<SourcePage[] | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [downloadedPageCount, setDownloadedPageCount] = useState(0);
  // Set right before switching to the previous chapter via tap navigation, so once its pages
  // finish loading we land on its *last* page instead of its first — matching how paging
  // backwards across a chapter boundary should feel.
  const landOnLastPageRef = useRef(false);
  const hasAutoAdvancedRef = useRef(false);
  const totalPagesForChapterRef = useRef(PLACEHOLDER_PAGE_COUNT);
  // Long strip has no discrete "current page" the way a pager does — this tracks each page's own
  // y-offset within the scroll content (via onLayout below) so handleWebtoonScroll can work out
  // which page the viewport center is over, matching real Tachiyomi's webtoon page counter.
  const webtoonPageOffsetsRef = useRef<number[]>([]);

  // Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/setting/ReaderNavigationOverlayView.kt
  // — real Tachiyomi flashes the tap zone layout briefly whenever you change reading mode or tap
  // zones, so you can see where PREV/NEXT/MENU actually landed without guessing/tapping blind.
  const [tapZoneHintVisible, setTapZoneHintVisible] = useState(false);
  const tapZoneHintOpacity = useRef(new Animated.Value(0)).current;
  const tapZoneHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageFadeAnim = useRef(new Animated.Value(1)).current;
  const showTapZoneHintBriefly = () => {
    if (tapZoneHintTimeoutRef.current) clearTimeout(tapZoneHintTimeoutRef.current);
    setTapZoneHintVisible(true);
    tapZoneHintOpacity.setValue(1);
    tapZoneHintTimeoutRef.current = setTimeout(() => {
      Animated.timing(tapZoneHintOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setTapZoneHintVisible(false);
      });
    }, 1600);
  };

  const chapters = useMemo(() => getChaptersByMangaId(manga.id), [manga.id]);
  const chapter = chapters[currentChapter];
  const effectiveMode = resolveEffectiveMode(readingMode);

  // Persists every change back to MMKV so it's still set next time — for *any* manga, not just
  // this one — matching real Tachiyomi's reader settings being global rather than per-title.
  useEffect(() => {
    setReaderPreferences({
      readingMode,
      tapZoneMode,
      invertMode,
      scaleType,
      bgMode,
      showPageNumber,
      confirmExit,
      keepScreenOn,
    });
  }, [readingMode, tapZoneMode, invertMode, scaleType, bgMode, showPageNumber, confirmExit, keepScreenOn]);

  // Ported from ReaderActivity's "Keep screen on" preference — on while the reader is mounted,
  // released the moment it isn't (chapter list, settings, etc. go back to normal screen timeout).
  // Guarded with typeof, not just `?.` on AppManager itself — a JS hot-reload can land before the
  // matching native rebuild installs, in which case the module exists but this method doesn't
  // yet, and `?.` alone would still call undefined and crash.
  useEffect(() => {
    if (typeof NativeModules.AppManager?.setKeepScreenOn !== 'function') return;
    NativeModules.AppManager.setKeepScreenOn(keepScreenOn);
    return () => {
      NativeModules.AppManager?.setKeepScreenOn?.(false);
    };
  }, [keepScreenOn]);

  // Matches real Tachiyomi: the hardware/gesture back action closes an open settings sheet first,
  // otherwise exits the reader (with a confirmation prompt if that preference is on) rather than
  // falling through to whatever the OS/navigator would otherwise do.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSettings) {
        setShowSettings(false);
        return true;
      }
      if (confirmExit) {
        Alert.alert('Exit reader?', 'Are you sure you want to exit?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Exit', style: 'destructive', onPress: onBack },
        ]);
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [showSettings, confirmExit, onBack]);

  // Prefer pages already saved to disk (see src/data/downloader.ts) over a network fetch —
  // that's the whole point of downloading a chapter. Falls back to fetching real pages from
  // the manga's registered Zomi source, and finally to a placeholder count for sources with no
  // real page data (e.g. the demo catalog).
  useEffect(() => {
    if (!chapter) {
      setRealPages(null);
      setPagesError(null);
      setDownloadedPageCount(0);
      return;
    }
    let cancelled = false;
    // Resume where you left off on a partially-read chapter, matching real Tachiyomi — a chapter
    // already marked fully read (or never opened) still starts fresh at page 1.
    setCurrentPage(!chapter.read && chapter.lastPageRead > 0 ? chapter.lastPageRead : 0);
    setPagesError(null);
    hasAutoAdvancedRef.current = false;
    webtoonPageOffsetsRef.current = [];

    const landOnLastPage = () => {
      if (!landOnLastPageRef.current) return;
      landOnLastPageRef.current = false;
      setCurrentPage(Math.max(0, totalPagesForChapterRef.current - 1));
    };

    if (isChapterDownloaded(manga.id, chapter.id)) {
      setRealPages(null);
      setPagesLoading(false);
      getDownloadedPageCount(manga.source, manga.id, chapter.id).then((count) => {
        if (cancelled) return;
        setDownloadedPageCount(count);
        totalPagesForChapterRef.current = count;
        landOnLastPage();
      });
      return () => {
        cancelled = true;
      };
    }

    setDownloadedPageCount(0);
    const source = getSourceById(manga.source);
    if (!source) {
      setRealPages(null);
      return;
    }
    setPagesLoading(true);
    source
      .getPageList(chapter.url)
      .then((pages) => {
        if (cancelled) return;
        setRealPages(pages);
        totalPagesForChapterRef.current = pages.length || PLACEHOLDER_PAGE_COUNT;
        landOnLastPage();
      })
      .catch((e) => {
        if (!cancelled) {
          setRealPages(null);
          setPagesError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setPagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manga.source, manga.id, chapter?.id, chapter?.url]);

  const totalPages =
    downloadedPageCount > 0
      ? downloadedPageCount
      : realPages && realPages.length > 0
        ? realPages.length
        : PLACEHOLDER_PAGE_COUNT;

  const getPageUri = (index: number): string | undefined => {
    if (!chapter) return undefined;
    if (downloadedPageCount > 0) return getDownloadedPageUri(manga.source, manga.id, chapter.id, index);
    return realPages?.[index]?.imageUrl;
  };

  // Only meaningful for realPages (some sources report each page's real pixel size up front) —
  // downloaded pages don't currently carry this metadata locally.
  const getPageRatio = (index: number): number | undefined => {
    const page = realPages?.[index];
    if (!page?.width || !page?.height) return undefined;
    return page.width / page.height;
  };

  const onAreaLayout = (e: LayoutChangeEvent) =>
    setAreaSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const goToPage = (page: number) => {
    setCurrentPage(page);
    if (getAppPreferences().hapticFeedback) Vibration.vibrate(10);
    pageFadeAnim.setValue(0);
    Animated.timing(pageFadeAnim, {
      toValue: 1,
      duration: PAGE_TURN_DURATIONS[getAppPreferences().pageTurnSpeed],
      useNativeDriver: true,
    }).start();
    if (!chapter) return;
    // Incognito Mode (More screen > Privacy): browse without updating read/last-page-read state,
    // same as real Tachiyomi's incognito tabs.
    if (getAppPreferences().incognitoMode) return;
    setLastPageRead(manga.id, chapter.id, page);
    if (page >= totalPages - 1) {
      markChapterRead(manga.id, chapter.id, true);
      syncTrackersForManga(manga.id);
    }
  };

  const goToNextChapter = () => {
    if (currentChapter >= chapters.length - 1) return;
    setCurrentChapter((c) => c + 1);
  };

  const goToPrevChapter = (landOnLastPage: boolean) => {
    if (currentChapter <= 0) return;
    landOnLastPageRef.current = landOnLastPage;
    setCurrentChapter((c) => c - 1);
  };

  // A horizontal fling at the page's default zoom level (see TachiyomiSubsamplingImageView.kt's
  // onFling) turns the page — opposite sense from tap-zones: swiping *left* drags new content in
  // from the right, i.e. "advance", same as swiping through a photo gallery. RTL manga reverses
  // that, same as it reverses which tap-zone means "next".
  const handleSwipe = (direction: 'left' | 'right') => {
    if (showSettings) return;
    const isRtl = effectiveMode === 'rtl';
    const action = (direction === 'left') !== isRtl ? 'next' : 'prev';
    if (action === 'prev') {
      if (currentPage > 0) goToPage(currentPage - 1);
      else goToPrevChapter(true);
    } else {
      if (currentPage < totalPages - 1) goToPage(currentPage + 1);
      else goToNextChapter();
    }
  };

  // Shared by both the Pressable-wrapped branches (handleTap below) and, for the paged branch,
  // TachiyomiPageImage's onSingleTap — the native SubsamplingScaleImageView owns its own touch
  // handling for pan/pinch/double-tap zoom, so the paged branch never wraps it in a Pressable
  // (mixing RN's own responder system with the native view's touch handling on the same tree is
  // what causes double or dropped taps).
  const handleZoneTap = (x: number, y: number) => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    if (areaSize.width === 0 || areaSize.height === 0) {
      setShowUI((u) => !u);
      return;
    }

    let nx = x / areaSize.width;
    let ny = y / areaSize.height;
    if (invertMode === 'horizontal' || invertMode === 'both') nx = 1 - nx;
    if (invertMode === 'vertical' || invertMode === 'both') ny = 1 - ny;

    let action = resolveZoneAction(resolveTapZoneMode(tapZoneMode, readingMode), nx, ny);
    if (action === 'left' || action === 'right') {
      const isRtl = effectiveMode === 'rtl';
      action = (action === 'left') === isRtl ? 'next' : 'prev';
    }

    if (action === 'prev') {
      if (currentPage > 0) goToPage(currentPage - 1);
      else goToPrevChapter(true);
    } else if (action === 'next') {
      if (currentPage < totalPages - 1) goToPage(currentPage + 1);
      else goToNextChapter();
    } else {
      setShowUI((u) => !u);
    }
  };

  // Webtoon-style strips scroll natively — there's no page-by-page tap navigation to compute,
  // so a tap there just toggles the UI chrome. Reaching the bottom of the scroll instead
  // auto-advances to the next chapter (see handleWebtoonScroll below).
  const handleTap = (e: GestureResponderEvent) => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    if (isWebtoonMode(readingMode) || areaSize.width === 0 || areaSize.height === 0) {
      setShowUI((u) => !u);
      return;
    }
    handleZoneTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
  };

  // Long strip pages are native TachiyomiPageImage instances wired directly through onSingleTap
  // (see the render below), not the Pressable-based handleTap — so this needs its own showSettings
  // check up front, same as handleTap/handleZoneTap, or a tap on a page while the settings sheet is
  // open would toggle the UI chrome underneath it instead of closing the sheet.
  const onWebtoonTap = () => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    setShowUI((u) => !u);
  };

  // Matches real Tachiyomi's continuous Long strip: scrolling to the bottom of the current
  // chapter's strip auto-advances into the next one instead of leaving the reader dead-ended.
  const handleWebtoonScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (distanceFromBottom < 80 && !hasAutoAdvancedRef.current && currentChapter < chapters.length - 1) {
      hasAutoAdvancedRef.current = true;
      goToNextChapter();
    }

    const viewportCenter = contentOffset.y + layoutMeasurement.height / 2;
    const offsets = webtoonPageOffsetsRef.current;
    let page = 0;
    // Bounded by totalPages, not offsets.length — the placeholder page count (used before real
    // page data loads) can be larger than the real one, leaving stale higher-index offsets behind
    // that would otherwise report a page number past the end of the actual chapter.
    for (let i = 0; i < totalPages && i < offsets.length; i++) {
      if (offsets[i] <= viewportCenter) page = i;
    }
    if (page !== currentPage) setCurrentPage(page);
  };

  return (
    <View style={[styles.screen, { backgroundColor: bgColors[bgMode] }]}>
      {showUI && (
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.roundButton} onPress={onBack}>
            <ArrowLeft size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {manga.title}
            </Text>
            <Text style={styles.topBarChapter}>Ch. {chapter?.chapterNumber ?? '-'}</Text>
          </View>
          <TouchableOpacity style={styles.roundButton} onPress={() => setShowSettings((v) => !v)}>
            <Settings2 size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Plain View, not Pressable — the paged branch below renders TachiyomiPageImage, whose
          native SubsamplingScaleImageView owns its own touch handling, and mixing RN's Pressable
          responder with that on the same tree causes dropped/doubled taps. Each non-zoomable
          branch (loading/error/webtoon/placeholder) wraps itself in its own Pressable instead. */}
      <View style={styles.readingArea} onLayout={onAreaLayout}>
        {pagesLoading ? (
          <Pressable style={styles.pageFill} onPress={handleTap}>
            <ActivityIndicator color={colors.accent} size="large" />
          </Pressable>
        ) : pagesError ? (
          <Pressable style={styles.pageFill} onPress={handleTap}>
            <Text style={styles.pageTitle}>Couldn't load this chapter</Text>
            <Text style={styles.pageChapter}>{pagesError}</Text>
          </Pressable>
        ) : isWebtoonMode(readingMode) ? (
          // No outer Pressable here — each page below is a native TachiyomiPageImage (same
          // conflict as the paged branch: a native view that consumes its own touches for
          // tap/zoom would just cause the wrapping Pressable to silently drop taps). Toggling the
          // UI on tap is wired directly through each page's onSingleTap instead.
          <ScrollView style={styles.pagedPageFill} onScroll={handleWebtoonScroll} scrollEventThrottle={100}>
            {Array.from({ length: totalPages }).map((_, i) => {
              const uri = getPageUri(i);
              const gapStyle = readingMode === 'continuous-vertical' && i < totalPages - 1 ? { marginBottom: 8 } : undefined;
              const onPageLayout = (e: LayoutChangeEvent) => {
                webtoonPageOffsetsRef.current[i] = e.nativeEvent.layout.y;
              };
              return uri ? (
                <View key={i} onLayout={onPageLayout}>
                  <TachiyomiPageImage
                    source={uri}
                    style={gapStyle}
                    fitWidth
                    initialRatio={getPageRatio(i)}
                    onSingleTap={onWebtoonTap}
                  />
                </View>
              ) : (
                <Pressable
                  key={i}
                  onLayout={onPageLayout}
                  onPress={onWebtoonTap}
                  style={[styles.webtoonPage, gapStyle, { backgroundColor: pageColors[i % pageColors.length] }]}
                >
                  <BookOpen size={40} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.webtoonTitle}>{manga.title}</Text>
                  <Text style={styles.webtoonPageLabel}>
                    Ch. {chapter?.chapterNumber ?? '-'} · Page {i + 1}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          // Page Turn Speed (More screen > Reader) drives this fade's duration — see the
          // useEffect below that re-triggers it on every currentPage change.
          <Animated.View style={{ flex: 1, opacity: pageFadeAnim }}>
            {getPageUri(currentPage) ? (
              // TachiyomiPageImage (SubsamplingScaleImageView under the hood) owns its own
              // pan/pinch/double-tap zoom and tile-decodes at full resolution, so there's no RN
              // ScrollView or JS-side zoom wrapper needed here anymore — a plain single tap (only
              // recognized as one once the view's own gesture detector rules out a drag/double-
              // tap) is forwarded to the same tap-zone navigation the other branches use.
              <TachiyomiPageImage
                style={styles.pagedPageFill}
                source={getPageUri(currentPage)!}
                onSingleTap={handleZoneTap}
                onSwipe={handleSwipe}
              />
            ) : (
              <Pressable style={[styles.pageFill, { backgroundColor: pageColors[currentPage % pageColors.length] }]} onPress={handleTap}>
                <BookOpen size={48} color="rgba(255,255,255,0.15)" />
                <Text style={styles.pageTitle}>{manga.title}</Text>
                <Text style={styles.pageChapter}>Chapter {chapter?.chapterNumber ?? '-'}</Text>
                <Text style={styles.pageNumber}>
                  Page {currentPage + 1} of {totalPages}
                </Text>
              </Pressable>
            )}
          </Animated.View>
        )}
      </View>

      {/* Ported from ReaderPreferences' "Show page number" — stays visible even with the rest of
          the chrome hidden, matching real Tachiyomi. In Long strip, currentPage is derived from
          scroll position (see handleWebtoonScroll) rather than tap-zone navigation, but the
          indicator itself applies the same way in every reading mode. */}
      {showPageNumber && (
        <View style={[styles.pageNumberIndicator, { bottom: insets.bottom + 10 }]} pointerEvents="none">
          <Text style={styles.pageNumberIndicatorText}>
            {currentPage + 1}/{totalPages}
          </Text>
        </View>
      )}

      {tapZoneHintVisible && !isWebtoonMode(readingMode) && (
        <Animated.View
          style={[styles.tapZoneHintOverlay, { opacity: tapZoneHintOpacity }]}
          pointerEvents="none"
        >
          {Array.from({ length: 3 }).map((_, row) =>
            Array.from({ length: 3 }).map((_, col) => {
              let nx = (col + 0.5) / 3;
              let ny = (row + 0.5) / 3;
              if (invertMode === 'horizontal' || invertMode === 'both') nx = 1 - nx;
              if (invertMode === 'vertical' || invertMode === 'both') ny = 1 - ny;
              let action = resolveZoneAction(resolveTapZoneMode(tapZoneMode, readingMode), nx, ny);
              if (action === 'left' || action === 'right') {
                const isRtl = effectiveMode === 'rtl';
                action = (action === 'left') === isRtl ? 'next' : 'prev';
              }
              const label = action === 'prev' ? 'PREV' : action === 'next' ? 'NEXT' : 'MENU';
              const cellColor =
                action === 'prev'
                  ? 'rgba(59,130,246,0.35)'
                  : action === 'next'
                    ? 'rgba(34,197,94,0.35)'
                    : 'rgba(148,163,184,0.2)';
              return (
                <View
                  key={`${row}-${col}`}
                  style={[styles.tapZoneHintCell, { backgroundColor: cellColor }]}
                >
                  <Text style={styles.tapZoneHintCellText}>{label}</Text>
                </View>
              );
            }),
          )}
        </Animated.View>
      )}

      {showUI && !isWebtoonMode(readingMode) && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.chapterNavRow}>
            <TouchableOpacity
              style={styles.chapterNavButton}
              disabled={currentChapter === 0}
              onPress={() => {
                setCurrentChapter((c) => Math.max(c - 1, 0));
                setCurrentPage(0);
              }}
            >
              <Text style={styles.chapterNavText}>Prev Ch.</Text>
            </TouchableOpacity>
            <Text style={styles.pageIndicator}>
              Ch. {chapter?.chapterNumber ?? '-'} · {currentPage + 1}/{totalPages}
            </Text>
            <TouchableOpacity
              style={styles.chapterNavButton}
              disabled={currentChapter === chapters.length - 1}
              onPress={() => {
                setCurrentChapter((c) => Math.min(c + 1, chapters.length - 1));
                setCurrentPage(0);
              }}
            >
              <Text style={styles.chapterNavText}>Next Ch.</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.sliderEdgeLabel}>1</Text>
            <Slider
              style={{ flex: 1 }}
              minimumValue={0}
              maximumValue={Math.max(totalPages - 1, 0)}
              step={1}
              value={currentPage}
              onValueChange={goToPage}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor={colors.accent}
            />
            <Text style={styles.sliderEdgeLabel}>{totalPages}</Text>
          </View>
        </View>
      )}

      {showSettings && (
        <View style={[styles.settingsPanel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.settingsHandle} />
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.settingsLabel}>READING MODE</Text>
            <View style={styles.modeGrid}>
              {readingModes.map((mode) => (
                <TouchableOpacity
                  key={mode.key}
                  onPress={() => {
                    setReadingMode(mode.key);
                    if (!isWebtoonMode(mode.key)) showTapZoneHintBriefly();
                  }}
                  style={[styles.modeButton, readingMode === mode.key && styles.modeButtonActive]}
                >
                  <Text style={[styles.modeButtonText, readingMode === mode.key && { color: '#fff' }]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!isWebtoonMode(readingMode) && (
              <>
                <Text style={styles.settingsLabel}>TAP ZONES</Text>
                <View style={styles.modeGrid}>
                  {tapZoneModes.map((mode) => (
                    <TouchableOpacity
                      key={mode.key}
                      onPress={() => {
                        setTapZoneMode(mode.key);
                        showTapZoneHintBriefly();
                      }}
                      style={[styles.modeButton, tapZoneMode === mode.key && styles.modeButtonActive]}
                    >
                      <Text style={[styles.modeButtonText, tapZoneMode === mode.key && { color: '#fff' }]}>
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.settingsLabel}>INVERT TAP ZONES</Text>
                <View style={styles.modeGrid}>
                  {invertModes.map((mode) => (
                    <TouchableOpacity
                      key={mode.key}
                      onPress={() => {
                        setInvertMode(mode.key);
                        showTapZoneHintBriefly();
                      }}
                      style={[styles.modeButton, invertMode === mode.key && styles.modeButtonActive]}
                    >
                      <Text style={[styles.modeButtonText, invertMode === mode.key && { color: '#fff' }]}>
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.settingsLabel}>SCALE TYPE</Text>
                <View style={styles.modeGrid}>
                  {scaleTypes.map((type) => (
                    <TouchableOpacity
                      key={type.key}
                      onPress={() => setScaleType(type.key)}
                      style={[styles.modeButton, scaleType === type.key && styles.modeButtonActive]}
                    >
                      <Text style={[styles.modeButtonText, scaleType === type.key && { color: '#fff' }]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.settingsLabel}>BACKGROUND</Text>
            <View style={styles.bgRow}>
              {(['white', 'sepia', 'dark'] as BackgroundMode[]).map((bg) => (
                <TouchableOpacity
                  key={bg}
                  onPress={() => setBgMode(bg)}
                  style={[styles.bgButton, bgMode === bg && styles.bgButtonActive]}
                >
                  {bg === 'white' ? (
                    <Sun size={14} color={colors.warning} />
                  ) : bg === 'sepia' ? (
                    <SunMedium size={14} color="#d97706" />
                  ) : (
                    <Moon size={14} color={colors.textFaint} />
                  )}
                  <Text style={styles.bgButtonText}>{bg}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.settingsLabel}>GENERAL</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show page number</Text>
              <TouchableOpacity
                onPress={() => setShowPageNumber((v) => !v)}
                style={[styles.toggleChip, showPageNumber && styles.toggleChipActive]}
              >
                <Text style={[styles.toggleChipText, showPageNumber && { color: '#fff' }]}>
                  {showPageNumber ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Keep screen on</Text>
              <TouchableOpacity
                onPress={() => setKeepScreenOn((v) => !v)}
                style={[styles.toggleChip, keepScreenOn && styles.toggleChipActive]}
              >
                <Text style={[styles.toggleChipText, keepScreenOn && { color: '#fff' }]}>
                  {keepScreenOn ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Confirm exit</Text>
              <TouchableOpacity
                onPress={() => setConfirmExit((v) => !v)}
                style={[styles.toggleChip, confirmExit && styles.toggleChipActive]}
              >
                <Text style={[styles.toggleChipText, confirmExit && { color: '#fff' }]}>
                  {confirmExit ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1 },
  pageNumberIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 25,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pageNumberIndicatorText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  tapZoneHintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tapZoneHintCell: {
    width: '33.333%',
    height: '33.333%',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapZoneHintCellText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  roundButton: { padding: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.4)' },
  topBarTitle: { color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: 200 },
  topBarChapter: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  readingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pagedPageFill: { width: '100%', height: '100%' },
  pageTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' },
  pageChapter: { color: 'rgba(255,255,255,0.35)', fontSize: 14 },
  pageNumber: { color: 'rgba(255,255,255,0.25)', fontSize: 12 },
  webtoonPage: { width: '100%', minHeight: 400, alignItems: 'center', justifyContent: 'center', gap: 8 },
  webtoonTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  webtoonPageLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: 'rgba(0,0,0,0.7)' },
  chapterNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chapterNavButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  chapterNavText: { color: '#fff', fontSize: 12 },
  pageIndicator: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderEdgeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  settingsPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40, padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  settingsHandle: { width: 40, height: 4, borderRadius: 999, backgroundColor: '#3a3a4a', alignSelf: 'center', marginBottom: 16 },
  settingsLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 10, marginTop: 4 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  modeButton: { flexBasis: '30%', flexGrow: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', gap: 4 },
  modeButtonActive: { backgroundColor: colors.accent },
  modeButtonText: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  bgRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  bgButton: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: 'transparent' },
  bgButtonActive: { backgroundColor: colors.border, borderColor: colors.accent },
  bgButtonText: { color: colors.textMuted, fontSize: 11, textTransform: 'capitalize' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  toggleLabel: { color: colors.text, fontSize: 13 },
  toggleChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.border },
  toggleChipActive: { backgroundColor: colors.accent },
  toggleChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
