import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { AppState } from 'react-native';
import {
  Search,
  Grid,
  List,
  SlidersHorizontal,
  BookOpen,
  CheckCircle2,
  Settings2,
  X,
  Tags,
  Circle,
  Download,
  Trash2,
} from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { Category, LibraryManga, Manga, MangaStatus, UNCATEGORIZED_ID, unreadCount as getUnreadCount } from '../data/models';
import {
  createCategory,
  getCategories,
  getCategoriesByMangaId,
  getChaptersByMangaId,
  getLibraryManga,
  markChapterRead,
  setMangaCategories,
  setMangaFavorite,
} from '../data/repository';
import { downloadAllChapters } from '../data/downloader';
import { checkForLibraryUpdatesIfDue, hasUnseenNewChapters, subscribeToLibraryUpdates, forceCheckForLibraryUpdates } from '../data/libraryUpdater';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { CategoryPickerModal } from '../components/CategoryPickerModal';

interface LibraryScreenProps {
  onSelectManga: (manga: Manga) => void;
}

const sortOptions = ['Title A-Z', 'Date Added', 'Last Updated', 'Unread Count'] as const;
type SortOption = (typeof sortOptions)[number];

const statusLabel: Record<MangaStatus, string> = {
  [MangaStatus.Unknown]: 'Unknown',
  [MangaStatus.Ongoing]: 'Ongoing',
  [MangaStatus.Completed]: 'Completed',
  [MangaStatus.Licensed]: 'Licensed',
  [MangaStatus.PublishingFinished]: 'Finished',
  [MangaStatus.Cancelled]: 'Cancelled',
  [MangaStatus.OnHiatus]: 'Hiatus',
};

function sortLibrary(items: LibraryManga[], sort: SortOption): LibraryManga[] {
  const sorted = [...items];
  switch (sort) {
    case 'Title A-Z':
      return sorted.sort((a, b) => a.manga.title.localeCompare(b.manga.title));
    case 'Date Added':
      return sorted.sort((a, b) => b.manga.dateAdded - a.manga.dateAdded);
    case 'Last Updated':
      return sorted.sort((a, b) => b.latestUpload - a.latestUpload);
    case 'Unread Count':
      return sorted.sort((a, b) => getUnreadCount(b) - getUnreadCount(a));
  }
}

export function LibraryScreen({ onSelectManga }: LibraryScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [activeSort, setActiveSort] = useState<SortOption>('Date Added');
  const [showSearch, setShowSearch] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const [libraryManga, setLibraryManga] = useState(() => getLibraryManga());
  const [categories, setCategories] = useState(() => getCategories());

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionMode = selectedIds.length > 0;
  const [showBulkCategoryPicker, setShowBulkCategoryPicker] = useState(false);
  const [bulkCategoryIds, setBulkCategoryIds] = useState<string[]>([]);

  const [unseenTick, setUnseenTick] = useState(0);
  useEffect(() => subscribeToLibraryUpdates(() => setUnseenTick((t) => t + 1)), []);
  const hasUnseen = useCallback((mangaId: string) => hasUnseenNewChapters(mangaId), [unseenTick]);

  const refreshLibrary = useCallback(() => {
    setLibraryManga(getLibraryManga());
    const freshCategories = getCategories();
    setCategories(freshCategories);
    setActiveCategory((prev) => (prev === 'all' || freshCategories.some((c) => c.id === prev) ? prev : 'all'));
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await forceCheckForLibraryUpdates();
      refreshLibrary();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, [refreshLibrary]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshLibrary();
        checkForLibraryUpdatesIfDue().then(refreshLibrary);
      }
    });
    checkForLibraryUpdatesIfDue().then(refreshLibrary);
    return () => sub.remove();
  }, [refreshLibrary]);

  const filtered = sortLibrary(
    libraryManga.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return item.manga.title.toLowerCase().includes(q) || (item.manga.author ?? '').toLowerCase().includes(q);
    }),
    activeSort,
  );

  const toggleSelected = (mangaId: string) => {
    setSelectedIds((prev) => (prev.includes(mangaId) ? prev.filter((id) => id !== mangaId) : [...prev, mangaId]));
  };

  const handleItemPress = (item: LibraryManga) => {
    if (selectionMode) toggleSelected(item.manga.id);
    else onSelectManga(item.manga);
  };

  const handleItemLongPress = (item: LibraryManga) => {
    toggleSelected(item.manga.id);
  };

  const clearSelection = () => setSelectedIds([]);

  // Mirrors real Tachiyomi's library selection bottom bar: categories, mark read/unread,
  // download, delete — all operating on every currently-selected manga at once.
  const handleBulkCategories = () => {
    const common = selectedIds
      .map((id) => getCategoriesByMangaId(id).map((c) => c.id).filter((id2) => id2 !== UNCATEGORIZED_ID))
      .reduce<string[] | null>((acc, ids) => (acc === null ? ids : acc.filter((id) => ids.includes(id))), null);
    setBulkCategoryIds(common ?? []);
    setShowBulkCategoryPicker(true);
  };

  const handleConfirmBulkCategories = (ids: string[]) => {
    selectedIds.forEach((mangaId) => setMangaCategories(mangaId, ids));
    setShowBulkCategoryPicker(false);
    clearSelection();
    refreshLibrary();
  };

  const handleBulkMarkRead = (read: boolean) => {
    selectedIds.forEach((mangaId) => {
      getChaptersByMangaId(mangaId).forEach((chapter) => markChapterRead(mangaId, chapter.id, read));
    });
    clearSelection();
    refreshLibrary();
  };

  const handleBulkDownload = () => {
    selectedIds.forEach((mangaId) => downloadAllChapters(mangaId));
    clearSelection();
  };

  const handleBulkDelete = () => {
    const count = selectedIds.length;
    Alert.alert(
      count === 1 ? 'Remove from library?' : `Remove ${count} titles from library?`,
      'Downloaded chapters will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            selectedIds.forEach((mangaId) => setMangaFavorite(mangaId, false));
            clearSelection();
            refreshLibrary();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {selectionMode ? (
            <>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.iconButton} onPress={clearSelection}>
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>{selectedIds.length} selected</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedIds(filtered.map((item) => item.manga.id))}>
                <Text style={styles.selectAllText}>Select all</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Library</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.iconButton} onPress={() => setShowSearch((v) => !v)}>
                  <Search size={20} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                >
                  {viewMode === 'grid' ? (
                    <List size={20} color={colors.textMuted} />
                  ) : (
                    <Grid size={20} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => setShowFilter((v) => !v)}>
                  <SlidersHorizontal size={20} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => setShowCategoryManager(true)}>
                  <Settings2 size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {showSearch && (
          <View style={styles.searchWrap}>
            <Search size={16} color={colors.textFaint} style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search manga..."
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              autoFocus
            />
          </View>
        )}

        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
            <TouchableOpacity
              onPress={() => setActiveCategory('all')}
              style={[styles.categoryChip, activeCategory === 'all' && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryText, activeCategory === 'all' && styles.categoryTextActive]}>All</Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setActiveCategory(cat.id)}
                style={[styles.categoryChip, activeCategory === cat.id && styles.categoryChipActive]}
              >
                <Text style={[styles.categoryText, activeCategory === cat.id && styles.categoryTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {showFilter && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>SORT BY</Text>
          <View style={styles.filterOptions}>
            {sortOptions.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => setActiveSort(opt)}
                style={[styles.sortChip, activeSort === opt && styles.sortChipActive]}
              >
                <Text style={[styles.sortChipText, activeSort === opt && styles.sortChipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.count}>{filtered.length} titles</Text>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <BookOpen size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Your library is empty</Text>
          <Text style={styles.emptySubtitle}>Manga you favorite from Browse will appear here</Text>
        </View>
      ) : viewMode === 'grid' ? (
        <FlatList
          data={filtered}
          key="grid"
          numColumns={3}
          keyExtractor={(item) => item.manga.id}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} tintColor={colors.accent} />
          }
          renderItem={({ item }) => {
            const unread = getUnreadCount(item);
            const selected = selectedIds.includes(item.manga.id);
            return (
              <TouchableOpacity
                style={styles.gridItem}
                activeOpacity={1}
                onPress={() => handleItemPress(item)}
                onLongPress={() => handleItemLongPress(item)}
                delayLongPress={350}
              >
                <View style={styles.gridCover}>
                  {item.manga.thumbnailUrl && (
                    <Image source={{ uri: item.manga.thumbnailUrl }} style={StyleSheet.absoluteFill} />
                  )}
                  <View style={styles.gridCoverShade} />
                  {selected && <View style={styles.gridSelectedShade} />}
                  {unread > 0 && !selected && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  )}
                  {hasUnseen(item.manga.id) && !selected && <View style={styles.newDot} />}
                  {selectionMode && (
                    <View style={[styles.selectCheck, selected && styles.selectCheckActive]}>
                      {selected && <CheckCircle2 size={14} color="#fff" />}
                    </View>
                  )}
                  <View style={styles.gridCaption}>
                    <Text style={styles.gridTitle} numberOfLines={2}>
                      {item.manga.title}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          data={filtered}
          key="list"
          keyExtractor={(item) => item.manga.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} tintColor={colors.accent} />
          }
          renderItem={({ item }) => {
            const unread = getUnreadCount(item);
            const selected = selectedIds.includes(item.manga.id);
            return (
              <TouchableOpacity
                style={[styles.listItem, selected && styles.listItemSelected]}
                activeOpacity={1}
                onPress={() => handleItemPress(item)}
                onLongPress={() => handleItemLongPress(item)}
                delayLongPress={350}
              >
                <View style={styles.listCover}>
                  {item.manga.thumbnailUrl && (
                    <Image source={{ uri: item.manga.thumbnailUrl }} style={StyleSheet.absoluteFill} />
                  )}
                  {unread > 0 && !selected && (
                    <View style={styles.listBadge}>
                      <Text style={styles.listBadgeText}>{unread}</Text>
                    </View>
                  )}
                  {hasUnseen(item.manga.id) && !selected && <View style={styles.listNewDot} />}
                  {selectionMode && (
                    <View style={[styles.selectCheck, selected && styles.selectCheckActive]}>
                      {selected && <CheckCircle2 size={14} color="#fff" />}
                    </View>
                  )}
                </View>
                <View style={styles.listInfo}>
                  <Text style={styles.listTitle} numberOfLines={1}>
                    {item.manga.title}
                  </Text>
                  {!!item.manga.author && <Text style={styles.listAuthor}>{item.manga.author}</Text>}
                  <View style={styles.listMetaRow}>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor:
                            item.manga.status === MangaStatus.Ongoing ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.1)',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: item.manga.status === MangaStatus.Ongoing ? colors.success : '#94a3b8',
                          fontSize: 10,
                        }}
                      >
                        {statusLabel[item.manga.status]}
                      </Text>
                    </View>
                    <Text style={styles.chapterCount}>{item.totalChapters} ch</Text>
                  </View>
                </View>
                {item.bookmarkCount > 0 && <CheckCircle2 size={14} color={colors.success} />}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <CategoryManagerModal
        visible={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        onChange={refreshLibrary}
      />

      <CategoryPickerModal
        visible={showBulkCategoryPicker}
        categories={categories}
        selectedIds={bulkCategoryIds}
        onClose={() => setShowBulkCategoryPicker(false)}
        onConfirm={handleConfirmBulkCategories}
        onCreateCategory={createCategory}
      />

      {selectionMode && (
        <View style={styles.selectionBar}>
          <TouchableOpacity style={styles.selectionAction} onPress={handleBulkCategories}>
            <Tags size={20} color={colors.text} />
            <Text style={styles.selectionActionText}>Categories</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionAction} onPress={() => handleBulkMarkRead(true)}>
            <CheckCircle2 size={20} color={colors.text} />
            <Text style={styles.selectionActionText}>Read</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionAction} onPress={() => handleBulkMarkRead(false)}>
            <Circle size={20} color={colors.text} />
            <Text style={styles.selectionActionText}>Unread</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionAction} onPress={handleBulkDownload}>
            <Download size={20} color={colors.text} />
            <Text style={styles.selectionActionText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionAction} onPress={handleBulkDelete}>
            <Trash2 size={20} color={colors.danger} />
            <Text style={[styles.selectionActionText, { color: colors.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { padding: 6 },
  selectAllText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  searchWrap: { position: 'relative', marginBottom: 12, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
  searchInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 36,
    paddingRight: 16,
    paddingVertical: 10,
  },
  categoryRow: { flexDirection: 'row' },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginRight: 8,
  },
  categoryChipActive: { backgroundColor: colors.accent },
  categoryText: { color: colors.textMuted, fontSize: 13 },
  categoryTextActive: { color: '#fff', fontWeight: '600' },
  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.border },
  sortChipActive: { backgroundColor: colors.accent },
  sortChipText: { color: colors.textMuted, fontSize: 12 },
  sortChipTextActive: { color: '#fff' },
  count: { color: colors.textFaint, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 96 },
  emptyTitle: { color: colors.textDim, fontSize: 15, fontWeight: '500' },
  emptySubtitle: { color: '#374151', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  gridContent: { paddingHorizontal: 16, paddingBottom: 96 },
  gridRow: { gap: 12, marginBottom: 12 },
  gridItem: { flex: 1 / 3 },
  gridCover: { aspectRatio: 3 / 4, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface },
  gridCoverShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  gridSelectedShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(232,93,4,0.35)',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  selectCheck: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCheckActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // Distinct from `badge` (unread count) — a plain dot marking manga with chapters found by the
  // last auto-update that haven't been seen yet (cleared on opening the manga's detail screen).
  newDot: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  gridCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6 },
  gridTitle: { color: '#fff', fontSize: 11, fontWeight: '600', lineHeight: 14 },
  listContent: { paddingHorizontal: 16, paddingBottom: 96, gap: 8 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  listItemSelected: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  listCover: { width: 52, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  listBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 2,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  listNewDot: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  listInfo: { flex: 1, minWidth: 0 },
  listTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  listAuthor: { color: colors.textFaint, fontSize: 12 },
  listMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chapterCount: { color: colors.textDim, fontSize: 11 },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
    paddingBottom: 18,
  },
  selectionAction: { flex: 1, alignItems: 'center', gap: 4 },
  selectionActionText: { color: colors.text, fontSize: 11 },
});
