import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, Alert, Share } from 'react-native';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Download,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Filter,
  SortDesc,
} from 'lucide-react-native';
import type { ChapterFilter } from '../components/ChapterFilterModal';
import { useThemeColors } from '../theme/useThemeColors';
import { Chapter, Manga, MangaStatus, UNCATEGORIZED_ID } from '../data/models';
import {
  addChapters,
  getCategories,
  getCategoriesByMangaId,
  getChapterSortDescByMangaId,
  getChaptersByMangaId,
  getDefaultCategoryId,
  createCategory,
  markChapterRead,
  setChapterSortDescByMangaId,
  setMangaCategories,
} from '../data/repository';
import { toggleFavorite } from '../data/interactors';
import { clearUnseenNewChapters } from '../data/libraryUpdater';
import { jsSourceChaptersToDomain } from '../data/jsSourceAdapter';
import { getSourceById } from '../data/sources/registry';
import { CategoryPickerModal } from '../components/CategoryPickerModal';
import { ChapterFilterModal } from '../components/ChapterFilterModal';
import { ActionSheetModal, ActionSheetOption } from '../components/ActionSheetModal';
import { SwipeableRow } from '../components/SwipeableRow';
import {
  cancelChapterDownload,
  cancelMangaDownloads,
  deleteChapterDownload,
  downloadAllChapters,
  downloadNextChapters,
  downloadUnreadChapters,
  getAllDownloadStates,
  queueChapterDownload,
  subscribeToDownloads,
} from '../data/downloader';
// Tracking imports removed

interface MangaDetailScreenProps {
  manga: Manga;
  onBack: () => void;
  onReadChapter: (chapterIndex: number) => void;
}

// Static, non-accent colors (success/info/danger never change with Theme Color) — safe to use
// as module-level constants outside the component, unlike the accent-derived hook colors.
const statusInfo: Record<MangaStatus, { label: string; bg: string; color: string }> = {
  [MangaStatus.Unknown]: { label: 'Unknown', bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  [MangaStatus.Ongoing]: { label: 'Ongoing', bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  [MangaStatus.Completed]: { label: 'Completed', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  [MangaStatus.Licensed]: { label: 'Licensed', bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
  [MangaStatus.PublishingFinished]: { label: 'Finished', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  [MangaStatus.Cancelled]: { label: 'Cancelled', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  [MangaStatus.OnHiatus]: { label: 'Hiatus', bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
};

export function MangaDetailScreen({ manga: initialManga, onBack, onReadChapter }: MangaDetailScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [manga, setManga] = useState(initialManga);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortDesc, setSortDesc] = useState(() => getChapterSortDescByMangaId(initialManga.id));
  const [chapterFilter, setChapterFilter] = useState<ChapterFilter>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [pickerCategories, setPickerCategories] = useState(() => getCategories());
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [downloadTick, setDownloadTick] = useState(0);
  const [chaptersTick, setChaptersTick] = useState(0);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [longPressChapter, setLongPressChapter] = useState<Chapter | null>(null);
  const chapters = useMemo(() => getChaptersByMangaId(manga.id), [manga.id, chaptersTick]);
  const chapterIndexById = useMemo(() => new Map(chapters.map((c, i) => [c.id, i])), [chapters]);

  useEffect(() => subscribeToDownloads(() => setDownloadTick((t) => t + 1)), []);

  // Opening a manga's detail screen counts as "seeing" any chapters found by the last auto-update
  // — clears its Library tab badge/list dot.
  useEffect(() => {
    clearUnseenNewChapters(manga.id);
  }, [manga.id]);

  const downloadStates = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getAllDownloadStates>[number]>();
    for (const state of getAllDownloadStates()) {
      if (state.mangaId === manga.id) map.set(state.chapterId, state);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manga.id, downloadTick]);

  const filteredChapters = useMemo(() => {
    switch (chapterFilter) {
      case 'unread':
        return chapters.filter((c) => !c.read);
      case 'read':
        return chapters.filter((c) => c.read);
      case 'bookmarked':
        return chapters.filter((c) => c.bookmark);
      case 'downloaded':
        return chapters.filter((c) => downloadStates.get(c.id)?.status === 'downloaded');
      default:
        return chapters;
    }
  }, [chapters, chapterFilter, downloadStates]);
  const orderedChapters = useMemo(
    () => (sortDesc ? [...filteredChapters].reverse() : filteredChapters),
    [filteredChapters, sortDesc],
  );
  const displayedChapters = useMemo(
    () => (showAll ? orderedChapters : orderedChapters.slice(0, 30)),
    [orderedChapters, showAll],
  );

  const readCount = chapters.filter((c) => c.read).length;
  const continueChapter = chapters.find((c) => !c.read);
  const continueIndex = continueChapter ? chapters.indexOf(continueChapter) : 0;
  const percentRead = chapters.length > 0 ? Math.round((readCount / chapters.length) * 100) : 0;
  const status = statusInfo[manga.status];
  const sourceName = manga.source;

  const handleQuickToggleFavorite = () => {
    if (manga.favorite) {
      setManga(toggleFavorite(manga));
      return;
    }
    const updated = toggleFavorite(manga);
    setMangaCategories(updated.id, [getDefaultCategoryId()]);
    setManga(updated);
  };

  const handleOpenCategoryPicker = () => {
    setPickerCategories(getCategories());
    setPickerSelectedIds(getCategoriesByMangaId(manga.id).map((c) => c.id).filter((id) => id !== UNCATEGORIZED_ID));
    setShowCategoryPicker(true);
  };

  const handleConfirmCategoryPicker = (ids: string[]) => {
    setMangaCategories(manga.id, ids);
    setManga((prev) => (prev.favorite ? prev : toggleFavorite(prev)));
    setShowCategoryPicker(false);
  };

  const handleCreateCategory = (name: string) => createCategory(name);

  const hasActiveDownloads = Array.from(downloadStates.values()).some(
    (s) => s.status === 'queued' || s.status === 'downloading',
  );

  // Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/manga/MangaScreen.kt's download
  // dropdown: fixed "next N" increments plus unread/all, instead of just two coarse options.
  const downloadMenuOptions: ActionSheetOption[] = [
    { label: 'Next chapter', onPress: () => downloadNextChapters(manga.id, 1) },
    { label: 'Next 5 chapters', onPress: () => downloadNextChapters(manga.id, 5) },
    { label: 'Next 10 chapters', onPress: () => downloadNextChapters(manga.id, 10) },
    { label: 'Next 25 chapters', onPress: () => downloadNextChapters(manga.id, 25) },
    { label: 'Unread', onPress: () => downloadUnreadChapters(manga.id) },
    { label: 'All', onPress: () => downloadAllChapters(manga.id) },
    ...(hasActiveDownloads
      ? [{ label: 'Cancel downloads', onPress: () => cancelMangaDownloads(manga.id), destructive: true }]
      : []),
  ];

  const handleRefresh = async () => {
    setShowOverflowMenu(false);
    if (refreshing) return;
    setRefreshing(true);
    try {
      const source = getSourceById(manga.source);
      if (!source) {
        Alert.alert('Refresh failed', "This manga's source extension isn't available right now.");
        return;
      }
      const sourceChapters = await source.getChapterList(manga.url);
      const domainChapters = jsSourceChaptersToDomain(manga.id, sourceChapters);
      const existingIds = new Set(getChaptersByMangaId(manga.id).map((c) => c.id));
      const newChapters = domainChapters.filter((c) => !existingIds.has(c.id));
      if (newChapters.length > 0) {
        addChapters(manga.id, newChapters);
        setChaptersTick((t) => t + 1);
      }
    } catch {
      Alert.alert('Refresh failed', 'Could not fetch the latest chapters. Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleShare = () => {
    setShowOverflowMenu(false);
    Share.share({ message: `${manga.title}${manga.description ? `\n\n${manga.description}` : ''}` });
  };

  const toggleChapterDownload = (chapter: Chapter) => {
    const state = downloadStates.get(chapter.id);
    if (state?.status === 'downloaded') {
      deleteChapterDownload(manga.id, chapter.id);
    } else if (state?.status === 'downloading' || state?.status === 'queued') {
      cancelChapterDownload(manga.id, chapter.id);
    } else {
      queueChapterDownload(manga.id, chapter.id);
    }
  };

  const toggleChapterRead = (chapter: Chapter) => {
    const nowRead = !chapter.read;
    markChapterRead(manga.id, chapter.id, nowRead);
    setChaptersTick((t) => t + 1);
  };

  // Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/manga/ChapterDialog.kt — same
  // long-press options real Tachiyomi's chapter list offers, minus categories-level actions that
  // don't apply to a single chapter.
  const longPressMenuOptions: ActionSheetOption[] = longPressChapter
    ? [
        downloadStates.get(longPressChapter.id)?.status === 'downloaded'
          ? { label: 'Delete download', onPress: () => toggleChapterDownload(longPressChapter), destructive: true }
          : { label: 'Download', onPress: () => toggleChapterDownload(longPressChapter) },
        longPressChapter.read
          ? { label: 'Mark as unread', onPress: () => toggleChapterRead(longPressChapter) }
          : { label: 'Mark as read', onPress: () => toggleChapterRead(longPressChapter) },
      ]
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 96 }}>
      <View style={styles.coverHeader}>
        <View style={styles.coverTopRow}>
          <TouchableOpacity style={styles.roundButton} onPress={onBack}>
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.roundButton} onPress={() => setShowOverflowMenu(true)}>
            <MoreVertical size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.coverImage}>
            {manga.thumbnailUrl && <Image source={{ uri: manga.thumbnailUrl }} style={StyleSheet.absoluteFill} />}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.mangaTitle}>{manga.title}</Text>
            {!!manga.author && <Text style={styles.mangaAuthor}>{manga.author}</Text>}
            <View style={styles.metaRow}>
              <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                <Text style={{ color: status.color, fontSize: 11, fontWeight: '600' }}>{status.label}</Text>
              </View>
              <Text style={styles.chapterCountText}>
                {chapters.length} chapters · {sourceName}
              </Text>
            </View>
            {!!manga.genre?.length && (
              <View style={styles.genreRow}>
                {manga.genre.slice(0, 3).map((g) => (
                  <View key={g} style={styles.genreChip}>
                    <Text style={styles.genreChipText}>{g}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => onReadChapter(continueIndex)}>
          <Text style={styles.primaryButtonText}>{readCount > 0 ? `Continue Ch. ${readCount + 1}` : 'Start Reading'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconSquareButton}
          onPress={handleQuickToggleFavorite}
          onLongPress={handleOpenCategoryPicker}
          delayLongPress={350}
        >
          {manga.favorite ? (
            <BookmarkCheck size={20} color={colors.accent} />
          ) : (
            <Bookmark size={20} color={colors.textMuted} />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconSquareButton} onPress={() => setShowDownloadMenu(true)}>
          <Download size={20} color={hasActiveDownloads ? colors.accent : colors.textMuted} />
        </TouchableOpacity>
      </View>

      {chapters.length > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>
              {readCount} / {chapters.length} chapters read
            </Text>
            <Text style={styles.progressPercent}>{percentRead}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percentRead}%` }]} />
          </View>
        </View>
      )}

      {!!manga.description && (
        <View style={styles.descriptionSection}>
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionText} numberOfLines={descExpanded ? undefined : 3}>
              {manga.description}
            </Text>
            <TouchableOpacity style={styles.showMoreRow} onPress={() => setDescExpanded((v) => !v)}>
              <Text style={styles.showMoreText}>{descExpanded ? 'Show less' : 'Show more'}</Text>
              {descExpanded ? <ChevronUp size={12} color={colors.accent} /> : <ChevronDown size={12} color={colors.accent} />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.chaptersHeaderRow}>
        <Text style={styles.chaptersHeaderTitle}>Chapters</Text>
        <View style={styles.chaptersHeaderActions}>
          <TouchableOpacity style={styles.chaptersHeaderButton} onPress={() => setShowFilterModal(true)}>
            <Filter size={16} color={chapterFilter !== 'all' ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.chaptersHeaderButton}
            onPress={() => {
              const next = !sortDesc;
              setSortDesc(next);
              setChapterSortDescByMangaId(manga.id, next);
            }}
          >
            <SortDesc size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chapterList}>
        {displayedChapters.map((chapter: Chapter) => {
          const realIndex = chapterIndexById.get(chapter.id)!;
          const dlState = downloadStates.get(chapter.id);
          const isDownloaded = dlState?.status === 'downloaded';
          return (
            <SwipeableRow
              key={chapter.id}
              leftAction={{
                icon: chapter.read ? (
                  <Circle size={20} color="#fff" />
                ) : (
                  <CheckCircle2 size={20} color="#fff" />
                ),
                color: chapter.read ? colors.textMuted : colors.success,
                onTrigger: () => toggleChapterRead(chapter),
              }}
              rightAction={{
                icon: <Download size={20} color="#fff" />,
                color: isDownloaded ? colors.danger : colors.accent,
                onTrigger: () => toggleChapterDownload(chapter),
              }}
            >
              <TouchableOpacity
                style={[styles.chapterRow, !chapter.read && styles.chapterRowUnread]}
                activeOpacity={1}
                onPress={() => onReadChapter(realIndex)}
                onLongPress={() => setLongPressChapter(chapter)}
                delayLongPress={350}
              >
                {chapter.read ? (
                  <CheckCircle2 size={16} color={colors.textDim} />
                ) : (
                  <Circle size={16} color={colors.accent} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.chapterTitle, { color: chapter.read ? colors.textDim : colors.text }]}>
                    Ch. {chapter.chapterNumber}
                    {chapter.name && chapter.name !== `Chapter ${chapter.chapterNumber}` ? ` · ${chapter.name}` : ''}
                  </Text>
                  <Text style={styles.chapterMeta}>{new Date(chapter.dateUpload).toLocaleDateString()}</Text>
                </View>
                {isDownloaded && <Download size={14} color={colors.success} />}
                {dlState?.status === 'downloading' && (
                  <Text style={styles.dlProgressText}>
                    {dlState.totalPages > 0 ? Math.round((dlState.downloadedPages / dlState.totalPages) * 100) : 0}%
                  </Text>
                )}
                {dlState?.status === 'queued' && <Text style={styles.dlProgressText}>Queued</Text>}
                {dlState?.status === 'error' && <Download size={14} color={colors.danger} />}
              </TouchableOpacity>
            </SwipeableRow>
          );
        })}
        {orderedChapters.length === 0 && (
          <View style={styles.emptyChapters}>
            <Text style={styles.emptyChaptersText}>
              {chapters.length === 0 ? 'No chapters available yet' : 'No chapters match this filter'}
            </Text>
          </View>
        )}
        {!showAll && orderedChapters.length > 30 && (
          <TouchableOpacity style={styles.showAllButton} onPress={() => setShowAll(true)}>
            <Text style={styles.showAllText}>Show all {orderedChapters.length} chapters</Text>
          </TouchableOpacity>
        )}
      </View>

      <ActionSheetModal
        visible={!!longPressChapter}
        title={longPressChapter ? `Ch. ${longPressChapter.chapterNumber}` : undefined}
        onClose={() => setLongPressChapter(null)}
        options={longPressMenuOptions}
      />

      <ActionSheetModal
        visible={showOverflowMenu}
        onClose={() => setShowOverflowMenu(false)}
        options={[
          { label: refreshing ? 'Refreshing…' : 'Refresh', onPress: handleRefresh },
          { label: 'Share', onPress: handleShare },
          { label: 'Edit categories', onPress: handleOpenCategoryPicker },
        ]}
      />

      <ActionSheetModal
        visible={showDownloadMenu}
        title="Download chapters"
        onClose={() => setShowDownloadMenu(false)}
        options={downloadMenuOptions}
      />

      <ChapterFilterModal
        visible={showFilterModal}
        value={chapterFilter}
        onClose={() => setShowFilterModal(false)}
        onSelect={setChapterFilter}
      />

      <CategoryPickerModal
        visible={showCategoryPicker}
        categories={pickerCategories}
        selectedIds={pickerSelectedIds}
        onClose={() => setShowCategoryPicker(false)}
        onConfirm={handleConfirmCategoryPicker}
        onCreateCategory={handleCreateCategory}
      />
    </ScrollView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  coverHeader: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 24 },
  coverTopRow: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
  roundButton: { padding: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  headerRow: { flexDirection: 'row', gap: 16 },
  coverImage: { width: 100, height: 140, borderRadius: 12, backgroundColor: colors.surface, overflow: 'hidden' },
  headerInfo: { flex: 1, minWidth: 0, paddingTop: 8 },
  mangaTitle: { color: colors.text, fontWeight: '700', fontSize: 17, lineHeight: 22 },
  mangaAuthor: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chapterCountText: { color: colors.textFaint, fontSize: 11 },
  genreRow: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  genreChip: { backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  genreChipText: { color: colors.textMuted, fontSize: 10 },
  actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  primaryButton: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  iconSquareButton: { padding: 12, borderRadius: 12, backgroundColor: colors.surface },
  progressSection: { paddingHorizontal: 16, paddingBottom: 16 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: colors.textMuted, fontSize: 12 },
  progressPercent: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  progressTrack: { height: 4, borderRadius: 999, backgroundColor: colors.surface, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: colors.accent },
  descriptionSection: { paddingHorizontal: 16, paddingBottom: 16 },
  descriptionCard: { padding: 12, borderRadius: 12, backgroundColor: colors.surface },
  descriptionText: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  showMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  showMoreText: { color: colors.accent, fontSize: 12 },
  chaptersHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  chaptersHeaderTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chaptersHeaderActions: { flexDirection: 'row', gap: 12 },
  chaptersHeaderButton: { padding: 4 },
  chapterList: { paddingHorizontal: 16, gap: 4 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.background },
  chapterRowUnread: { backgroundColor: '#1a1a24', borderWidth: 1, borderColor: colors.border },
  chapterTitle: { fontSize: 13, fontWeight: '500' },
  chapterMeta: { color: colors.textFaint, fontSize: 11 },
  dlProgressText: { color: colors.accent, fontSize: 10, fontWeight: '600' },
  emptyChapters: { paddingVertical: 32, alignItems: 'center' },
  emptyChaptersText: { color: colors.textDim, fontSize: 13 },
  showAllButton: { paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', marginTop: 8 },
  showAllText: { color: colors.accent, fontSize: 13 },
});
