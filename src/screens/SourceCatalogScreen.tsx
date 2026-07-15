import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { ArrowLeft, Search, X, AlertTriangle } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { MangaSource, SourceManga } from '../data/sources/types';

interface SourceCatalogScreenProps {
  source: MangaSource;
  onBack: () => void;
  onSelectManga: (source: MangaSource, manga: SourceManga) => Promise<void>;
}

type Tab = 'popular' | 'latest' | 'search';

export function SourceCatalogScreen({ source, onBack, onSelectManga }: SourceCatalogScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<Tab>('popular');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const [mangas, setMangas] = useState<SourceManga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingManga, setOpeningManga] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const result =
          activeTab === 'popular'
            ? await source.getPopular(targetPage)
            : activeTab === 'latest'
              ? await source.getLatest(targetPage)
              : await source.search(submittedQuery, targetPage);
        setMangas((prev) => (append ? [...prev, ...result.manga] : result.manga));
        setHasNextPage(result.manga.length > 0);
        setPage(targetPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!append) setMangas([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [source, activeTab, submittedQuery],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPage(1, false);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    if (activeTab === 'search' && !submittedQuery) {
      setMangas([]);
      return;
    }
    fetchPage(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, submittedQuery]);

  const handleSearchSubmit = () => {
    setActiveTab('search');
    setSubmittedQuery(searchQuery.trim());
    setShowSearch(false);
  };

  const handleSelect = async (manga: SourceManga) => {
    if (openingManga) return;
    setOpeningManga(manga.url);
    try {
      await onSelectManga(source, manga);
    } finally {
      setOpeningManga(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {showSearch ? (
          <View style={styles.searchRow}>
            <TouchableOpacity onPress={() => setShowSearch(false)} style={styles.headerIcon}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
            <TextInput
              autoFocus
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
              placeholder={`Search ${source.name}...`}
              placeholderTextColor={colors.textFaint}
              returnKeyType="search"
            />
          </View>
        ) : (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onBack} style={styles.headerIcon}>
              <ArrowLeft size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerName} numberOfLines={1}>
              {source.name}
            </Text>
            <TouchableOpacity style={styles.headerIcon} onPress={() => setShowSearch(true)}>
              <Search size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tabs}>
          {(['popular', 'latest'] as Tab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'popular' ? 'Popular' : 'Latest'}
              </Text>
            </TouchableOpacity>
          ))}
          {activeTab === 'search' && (
            <View style={[styles.tab, styles.tabActive]}>
              <Text style={[styles.tabText, styles.tabTextActive]} numberOfLines={1}>
                "{submittedQuery}"
              </Text>
            </View>
          )}
        </View>
      </View>

      <FlatList
        data={mangas}
        key="grid"
        numColumns={3}
        keyExtractor={(m) => m.url}
        contentContainerStyle={mangas.length === 0 ? { flex: 1, justifyContent: 'center', alignItems: 'center' } : styles.gridContent}
        columnWrapperStyle={mangas.length > 0 ? styles.gridRow : undefined}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !loadingMore) fetchPage(page + 1, true);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} size="large" />
          ) : error ? (
            <View style={styles.centerState}>
              <AlertTriangle size={36} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {activeTab === 'search' ? 'No results' : 'Nothing here yet'}
            </Text>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => handleSelect(item)}
            disabled={openingManga !== null}
          >
            <View style={styles.gridCover}>
              {item.thumbnailUrl && <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} />}
              <View style={styles.gridCoverShade} />
              {openingManga === item.url && (
                <View style={styles.openingOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <View style={styles.gridCaption}>
                <Text style={styles.gridTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  headerIcon: { padding: 10 },
  headerName: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', paddingHorizontal: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 4 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.background },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingVertical: 64 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  emptyText: { color: colors.textDim, fontSize: 14 },
  gridContent: { padding: 12 },
  gridRow: { gap: 8, marginBottom: 8 },
  gridItem: { flex: 1 / 3 },
  gridCover: { aspectRatio: 3 / 4, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface },
  gridCoverShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  openingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  gridCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6 },
  gridTitle: { color: '#fff', fontSize: 11, fontWeight: '600', lineHeight: 14 },
});
