import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Search, TrendingUp, Zap } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { MangaSource, SourceManga } from '../data/sources/types';
import { getInstalledSources, InstalledSourceInfo } from '../data/sources/registry';

interface BrowseMangaItem extends SourceManga {
  sourceId: string;
  sourceName: string;
}

interface BrowseScreenProps {
  onSelectManga: (source: MangaSource, manga: SourceManga) => void;
  onOpenSource: (source: MangaSource) => void;
}

// Fans out getPopular/getLatest/search across every source the user has actually installed and
// merges the results — there's no single "home" API to call, so this is what "trending" and
// "recently updated" mean when the data has to be real and scoped to what's installed.
async function fetchAcrossSources(
  installedSources: MangaSource[],
  fn: (source: MangaSource) => Promise<{ manga: SourceManga[]; hasNextPage: boolean }>,
  perSourceLimit: number,
): Promise<BrowseMangaItem[]> {
  const results = await Promise.allSettled(
    installedSources.map(async (source) => {
      const page = await fn(source);
      return page.manga.slice(0, perSourceLimit).map((m) => ({ ...m, sourceId: source.id, sourceName: source.name }));
    }),
  );
  const items: BrowseMangaItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') items.push(...result.value);
  }
  return items;
}

export function BrowseScreen({ onSelectManga, onOpenSource }: BrowseScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BrowseMangaItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [installedSources, setInstalledSources] = useState<InstalledSourceInfo[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);

  const [trending, setTrending] = useState<BrowseMangaItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [latest, setLatest] = useState<BrowseMangaItem[]>([]);
  const [latestLoading, setLatestLoading] = useState(true);

  const refreshInstalledSources = useCallback(async () => {
    const installed = await getInstalledSources();
    setInstalledSources(installed);
    setSourcesLoading(false);
  }, []);

  useEffect(() => {
    refreshInstalledSources();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshInstalledSources();
    });
    return () => sub.remove();
  }, [refreshInstalledSources]);

  const sourceList = installedSources.map((i) => i.source);

  useEffect(() => {
    if (sourcesLoading) return;
    let cancelled = false;
    setTrendingLoading(true);
    fetchAcrossSources(sourceList, (s) => s.getPopular(1), 10).then((items) => {
      if (!cancelled) {
        setTrending(items);
        setTrendingLoading(false);
      }
    });
    setLatestLoading(true);
    fetchAcrossSources(sourceList, (s) => s.getLatest(1), 10).then((items) => {
      if (!cancelled) {
        setLatest(items);
        setLatestLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedSources, sourcesLoading]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || sourcesLoading) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(() => {
      fetchAcrossSources(sourceList, (s) => s.search(query, 1), 15).then((items) => {
        if (!cancelled) {
          setSearchResults(items);
          setSearching(false);
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, installedSources, sourcesLoading]);

  const findSource = (id: string) => sourceList.find((s) => s.id === id);
  const handleSelect = (item: BrowseMangaItem) => {
    const source = findSource(item.sourceId);
    if (source) onSelectManga(source, item);
  };

  const showEmptySources = !sourcesLoading && installedSources.length === 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Browse</Text>
        <View style={styles.searchWrap}>
          <Search size={16} color={colors.textFaint} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search manga across all sources..."
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 96 }}>
        {searchQuery.trim() ? (
          <View style={styles.section}>
            {searching ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <>
                <Text style={styles.resultCount}>
                  {searchResults.length} results for "{searchQuery}"
                </Text>
                {searchResults.length > 0 ? (
                  searchResults.map((manga) => (
                    <TouchableOpacity
                      key={`${manga.sourceId}:${manga.url}`}
                      style={styles.resultItem}
                      onPress={() => handleSelect(manga)}
                    >
                      <View style={styles.resultCover}>
                        {manga.thumbnailUrl && <Image source={{ uri: manga.thumbnailUrl }} style={StyleSheet.absoluteFill} />}
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {manga.title}
                        </Text>
                        <Text style={styles.resultAuthor}>{manga.sourceName}</Text>
                        {!!manga.genres?.length && (
                          <View style={styles.genreRow}>
                            {manga.genres.slice(0, 2).map((g) => (
                              <View key={g} style={styles.genreChip}>
                                <Text style={styles.genreChipText}>{g}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Search size={36} color={colors.border} />
                    <Text style={styles.emptyText}>No results found</Text>
                  </View>
                )}
              </>
            )}
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SOURCES</Text>
              {sourcesLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginLeft: 16 }} />
              ) : showEmptySources ? (
                <Text style={styles.emptyInlineText}>
                  No sources installed yet. Install one from the Extensions tab.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceRow}>
                  {installedSources.map(({ source, iconUrl }) => (
                    <TouchableOpacity key={source.id} style={styles.sourceBubbleWrap} onPress={() => onOpenSource(source)}>
                      <View style={styles.sourceBubbleRing}>
                        <View style={styles.sourceBubble}>
                          {iconUrl ? (
                            <Image source={{ uri: iconUrl }} style={styles.sourceBubbleImage} />
                          ) : (
                            <Text style={styles.sourceBubbleLetter}>{source.name.charAt(0)}</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <TrendingUp size={16} color={colors.accent} />
                <Text style={styles.sectionTitle}>Trending Now</Text>
              </View>
              {trendingLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginLeft: 16 }} />
              ) : trending.length === 0 ? (
                <Text style={styles.emptyInlineText}>No trending manga right now.</Text>
              ) : (
                <FlatList
                  data={trending}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(m) => `${m.sourceId}:${m.url}`}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                  renderItem={({ item: manga, index }) => (
                    <TouchableOpacity style={styles.trendingCard} onPress={() => handleSelect(manga)}>
                      <View style={styles.trendingCover}>
                        {manga.thumbnailUrl && <Image source={{ uri: manga.thumbnailUrl }} style={StyleSheet.absoluteFill} />}
                        <View style={styles.trendingShade} />
                        <View style={styles.trendingRank}>
                          <Text style={styles.trendingRankText}>{index + 1}</Text>
                        </View>
                        <View style={styles.trendingCaption}>
                          <Text style={styles.trendingTitle} numberOfLines={2}>
                            {manga.title}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.trendingSource}>{manga.sourceName}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Zap size={16} color={colors.info} />
                <Text style={styles.sectionTitle}>Recently Updated</Text>
              </View>
              {latestLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginLeft: 16 }} />
              ) : latest.length === 0 ? (
                <Text style={styles.emptyInlineText}>No recent updates right now.</Text>
              ) : (
                <View style={{ paddingHorizontal: 16, gap: 8 }}>
                  {latest.map((manga) => (
                    <TouchableOpacity
                      key={`${manga.sourceId}:${manga.url}`}
                      style={styles.updatedItem}
                      onPress={() => handleSelect(manga)}
                    >
                      <View style={styles.updatedCover}>
                        {manga.thumbnailUrl && <Image source={{ uri: manga.thumbnailUrl }} style={StyleSheet.absoluteFill} />}
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.updatedTitle} numberOfLines={1}>
                          {manga.title}
                        </Text>
                        <Text style={styles.updatedSource}>{manga.sourceName}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: manga.status === 'ongoing' ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)' },
                        ]}
                      >
                        <Text style={{ color: manga.status === 'ongoing' ? colors.success : '#94a3b8', fontSize: 10 }}>
                          {manga.status}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  searchWrap: { justifyContent: 'center' },
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
    paddingVertical: 12,
  },
  body: { flex: 1 },
  section: { marginBottom: 20, paddingHorizontal: 0 },
  resultCount: { color: colors.textMuted, fontSize: 12, marginBottom: 10, paddingHorizontal: 16 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  resultCover: { width: 48, height: 64, borderRadius: 8, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  resultInfo: { flex: 1, minWidth: 0 },
  resultTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  resultAuthor: { color: colors.textFaint, fontSize: 12 },
  genreRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  genreChip: { backgroundColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  genreChipText: { color: colors.textMuted, fontSize: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: colors.textDim, fontSize: 14 },
  emptyInlineText: { color: colors.textDim, fontSize: 13, paddingHorizontal: 16 },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 12, paddingHorizontal: 16 },
  sourceRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 16 },
  sourceBubbleWrap: { alignItems: 'center' },
  sourceBubbleRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBubbleImage: { width: '100%', height: '100%' },
  sourceBubbleLetter: { color: colors.accent, fontWeight: '700', fontSize: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 16 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  trendingCard: { width: 110 },
  trendingCover: { height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  trendingShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  trendingRank: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingRankText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  trendingCaption: { position: 'absolute', bottom: 6, left: 6, right: 6 },
  trendingTitle: { color: '#fff', fontSize: 10, fontWeight: '600', lineHeight: 13 },
  trendingSource: { color: colors.textFaint, fontSize: 10, marginTop: 4 },
  updatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  updatedCover: { width: 44, height: 58, borderRadius: 8, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  updatedTitle: { color: colors.text, fontSize: 13, fontWeight: '500' },
  updatedSource: { color: colors.textFaint, fontSize: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
});
