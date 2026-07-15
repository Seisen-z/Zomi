import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp, Trash2, X, WifiOff, RefreshCw, Pause, Play } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { Chapter, Manga } from '../data/models';
import { getChaptersByMangaId, getMangaById } from '../data/repository';
import {
  ChapterDownloadState,
  cancelChapterDownload,
  cancelMangaDownloads,
  deleteChapterDownload,
  getAllDownloadStates,
  isDownloadsPaused,
  pauseDownloads,
  queueChapterDownload,
  resumeDownloads,
  subscribeToDownloads,
} from '../data/downloader';

interface DownloadGroupItem {
  chapter: Chapter;
  state: ChapterDownloadState;
}

interface DownloadGroup {
  manga: Manga;
  items: DownloadGroupItem[];
}

function buildGroups(): DownloadGroup[] {
  const byManga = new Map<string, ChapterDownloadState[]>();
  for (const state of getAllDownloadStates()) {
    if (!byManga.has(state.mangaId)) byManga.set(state.mangaId, []);
    byManga.get(state.mangaId)!.push(state);
  }

  const groups: DownloadGroup[] = [];
  for (const [mangaId, states] of byManga) {
    const manga = getMangaById(mangaId);
    if (!manga) continue;
    const chapters = getChaptersByMangaId(mangaId);
    const items: DownloadGroupItem[] = states
      .map((state) => {
        const chapter = chapters.find((c) => c.id === state.chapterId);
        return chapter ? { chapter, state } : null;
      })
      .filter((x): x is DownloadGroupItem => x != null)
      .sort((a, b) => a.chapter.chapterNumber - b.chapter.chapterNumber);
    if (items.length > 0) groups.push({ manga, items });
  }
  return groups;
}

function statusLabel(state: ChapterDownloadState): string {
  switch (state.status) {
    case 'downloaded':
      return 'Downloaded';
    case 'downloading':
      return state.totalPages > 0 ? `${Math.round((state.downloadedPages / state.totalPages) * 100)}%` : 'Starting…';
    case 'queued':
      return 'Queued';
    case 'error':
      return 'Failed';
  }
}

export function DownloadsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [groups, setGroups] = useState<DownloadGroup[]>(() => buildGroups());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(() => isDownloadsPaused());

  useEffect(() => subscribeToDownloads(() => {
    setGroups(buildGroups());
    setPaused(isDownloadsPaused());
  }), []);

  const toggleCollapsed = (mangaId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(mangaId)) next.delete(mangaId);
      else next.add(mangaId);
      return next;
    });
  };

  const totalActive = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.filter((i) => i.state.status !== 'downloaded').length, 0),
    [groups],
  );
  const totalDownloaded = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.filter((i) => i.state.status === 'downloaded').length, 0),
    [groups],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Downloads</Text>
          {totalActive > 0 && (
            <TouchableOpacity
              style={styles.pauseButton}
              onPress={() => (paused ? resumeDownloads() : pauseDownloads())}
            >
              {paused ? <Play size={16} color={colors.accent} /> : <Pause size={16} color={colors.textMuted} />}
              <Text style={[styles.pauseButtonText, paused && { color: colors.accent }]}>
                {paused ? 'Resume' : 'Pause'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {groups.length > 0 && (
          <Text style={styles.headerSubtitle}>
            {totalActive} remaining · {totalDownloaded} downloaded{paused ? ' · Paused' : ''}
          </Text>
        )}
      </View>

      {groups.length === 0 ? (
        <View style={styles.emptyState}>
          <WifiOff size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No downloads</Text>
          <Text style={styles.emptySubtitle}>
            Tap the download icon on a manga's detail page to download unread or all chapters.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 96, gap: 12 }}
          data={groups}
          keyExtractor={(g) => g.manga.id}
          renderItem={({ item: group }) => {
            const isCollapsed = collapsed.has(group.manga.id);
            const downloaded = group.items.filter((i) => i.state.status === 'downloaded').length;
            const remaining = group.items.length - downloaded;
            const activeItem = group.items.find((i) => i.state.status === 'downloading');
            const hasActive = group.items.some((i) => i.state.status === 'queued' || i.state.status === 'downloading');
            const summary = activeItem
              ? `Downloading Ch. ${activeItem.chapter.chapterNumber} · ${remaining} remaining`
              : remaining > 0
                ? `${remaining} queued`
                : `${downloaded} downloaded`;

            return (
              <View style={styles.group}>
                <TouchableOpacity style={styles.groupHeader} onPress={() => toggleCollapsed(group.manga.id)}>
                  <View style={styles.groupCover}>
                    {group.manga.thumbnailUrl && (
                      <Image source={{ uri: group.manga.thumbnailUrl }} style={StyleSheet.absoluteFill} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.groupTitle} numberOfLines={1}>
                      {group.manga.title}
                    </Text>
                    <Text style={styles.groupSummary}>{summary}</Text>
                  </View>
                  {hasActive && (
                    <TouchableOpacity style={styles.groupAction} onPress={() => cancelMangaDownloads(group.manga.id)}>
                      <X size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                  {isCollapsed ? (
                    <ChevronDown size={18} color={colors.textMuted} />
                  ) : (
                    <ChevronUp size={18} color={colors.textMuted} />
                  )}
                </TouchableOpacity>

                {!isCollapsed && (
                  <View style={styles.chapterList}>
                    {group.items.map(({ chapter, state }) => (
                      <View key={chapter.id} style={styles.chapterRow}>
                        <Text style={styles.chapterName} numberOfLines={1}>
                          Ch. {chapter.chapterNumber}
                          {chapter.name && chapter.name !== `Chapter ${chapter.chapterNumber}` ? ` · ${chapter.name}` : ''}
                        </Text>
                        <Text
                          style={[
                            styles.chapterStatus,
                            state.status === 'downloaded' && { color: colors.success },
                            state.status === 'error' && { color: colors.danger },
                          ]}
                        >
                          {statusLabel(state)}
                        </Text>
                        {state.status === 'downloaded' ? (
                          <TouchableOpacity
                            style={styles.chapterAction}
                            onPress={() => deleteChapterDownload(group.manga.id, chapter.id)}
                          >
                            <Trash2 size={14} color={colors.textFaint} />
                          </TouchableOpacity>
                        ) : state.status === 'error' ? (
                          <>
                            <TouchableOpacity
                              style={styles.chapterAction}
                              onPress={() => queueChapterDownload(group.manga.id, chapter.id)}
                            >
                              <RefreshCw size={14} color={colors.accent} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.chapterAction}
                              onPress={() => cancelChapterDownload(group.manga.id, chapter.id)}
                            >
                              <X size={14} color={colors.textFaint} />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            style={styles.chapterAction}
                            onPress={() => cancelChapterDownload(group.manga.id, chapter.id)}
                          >
                            <X size={14} color={colors.textFaint} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  headerSubtitle: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  pauseButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  pauseButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  list: { flex: 1, paddingHorizontal: 16 },
  group: { borderRadius: 12, backgroundColor: colors.surface, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  groupCover: { width: 40, height: 54, borderRadius: 6, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  groupSummary: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  groupAction: { padding: 6 },
  chapterList: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingVertical: 4 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  chapterName: { flex: 1, minWidth: 0, color: colors.textMuted, fontSize: 12 },
  chapterStatus: { color: colors.accent, fontSize: 11, fontWeight: '600' },
  chapterAction: { padding: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 96, paddingHorizontal: 32 },
  emptyTitle: { color: colors.textDim, fontSize: 15, fontWeight: '500' },
  emptySubtitle: { color: '#374151', fontSize: 13, textAlign: 'center' },
});
