import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Image, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Search, ChevronRight, Package, AlertTriangle, RefreshCw, Download } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { AvailableExtension } from '../data/models';
import { getExtensionRepos, getCachedExtensions, setCachedExtensions } from '../data/repository';
import { fetchAllAvailableExtensions } from '../data/extensionApi';
import { downloadAndInstallExtension, getInstalledPackages, uninstallPackage } from '../data/extensionInstaller';
import { getSourceInfo, SourceInfo } from '../data/sourceBridge';
import { CircularProgress } from '../components/CircularProgress';
import { ExtensionReposScreen } from './ExtensionReposScreen';

export interface OpenSourceParams {
  pkgName: string;
  sourceName: string;
  lang: string;
  baseUrl: string;
}

function ExtensionIcon({ ext }: { ext: AvailableExtension }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={styles.extIcon}>
        <Text style={styles.extIconText}>{ext.name.charAt(0).toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: ext.iconUrl }}
      style={styles.extIconImage}
      onError={() => setFailed(true)}
    />
  );
}

type InstallState = { status: 'idle' } | { status: 'downloading'; progress: number } | { status: 'error' };

interface InstallButtonProps {
  ext: AvailableExtension;
  isInstalled: boolean;
  onInstalledRefresh: () => void;
}

function InstallButton({ ext, isInstalled, onInstalledRefresh }: InstallButtonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState<InstallState>({ status: 'idle' });

  const startInstall = async () => {
    setState({ status: 'downloading', progress: 0 });
    try {
      await downloadAndInstallExtension(ext, (progress) => setState({ status: 'downloading', progress }));
      setState({ status: 'idle' });
      onInstalledRefresh();
    } catch (e) {
      console.error('Install failed error:', e);
      if (e instanceof Error) {
        console.error('Error stack:', e.stack);
        console.error('Error message:', e.message);
      }
      try {
        console.error('Serialized error:', JSON.stringify(e));
      } catch (_) {}
      setState({ status: 'error' });
    }
  };

  if (isInstalled) {
    return (
      <View style={styles.installedBadge}>
        <Text style={styles.installedBadgeText}>Installed</Text>
      </View>
    );
  }

  if (state.status === 'downloading') {
    return (
      <View style={styles.progressButton}>
        <CircularProgress progress={state.progress} size={32} strokeWidth={3} strokeColor={colors.success}>
          <Download size={14} color={colors.success} />
        </CircularProgress>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <TouchableOpacity style={styles.errorButton} onPress={startInstall}>
        <RefreshCw size={14} color={colors.danger} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.installButton} onPress={startInstall}>
      <Download size={14} color={colors.success} />
    </TouchableOpacity>
  );
}

interface ExtensionsScreenProps {
  onOpenSource: (params: OpenSourceParams) => void;
}

export function ExtensionsScreen({ onOpenSource }: ExtensionsScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<'installed' | 'browse'>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRepoScreen, setShowRepoScreen] = useState(false);
  const [repos, setRepos] = useState<string[]>(() => getExtensionRepos());
  const [extensions, setExtensions] = useState<AvailableExtension[]>(() => getCachedExtensions()?.extensions ?? []);
  const [errors, setErrors] = useState<{ repoUrl: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [installedPackages, setInstalledPackages] = useState<Set<string>>(new Set());

  const updateInstalledPackages = useCallback(async () => {
    const pkgs = await getInstalledPackages();
    const extPkgs = pkgs.filter(p => p.includes('.extension.') || p.startsWith('keiyoushi.extension') || p.startsWith('eu.kanade.tachiyomi.extension'));
    setInstalledPackages(new Set(extPkgs));
  }, []);

  useEffect(() => {
    updateInstalledPackages();
  }, [updateInstalledPackages]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        updateInstalledPackages();
      }
    });
    return () => subscription.remove();
  }, [updateInstalledPackages]);

  // Real Tachiyomi limits repo re-checks to once a day (ExtensionApi.checkForUpdates). A repo
  // like Keiyoushi's index.min.json covers 700+ extensions, so re-fetching + re-parsing it on
  // every visit to this screen isn't just wasteful — on a debug JS engine it's slow enough to
  // trip Android's ANR watchdog. Only hit the network when there's no valid cache for the
  // current repo set; the refresh button is the explicit escape hatch for a real re-fetch.
  const fetchExtensions = useCallback(async () => {
    if (repos.length === 0) {
      setExtensions([]);
      setErrors([]);
      return;
    }
    setLoading(true);
    // Yield one tick first so the loading spinner actually paints before the blocking
    // JSON.parse + map pass starts, instead of freezing mid-transition.
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 50));
    const results = await fetchAllAvailableExtensions();
    const fetched = results.flatMap((r) => r.extensions);
    setExtensions(fetched);
    setCachedExtensions(fetched);
    setErrors(results.filter((r) => r.error).map((r) => ({ repoUrl: r.repoUrl, error: r.error! })));
    setLoading(false);
  }, [repos]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await updateInstalledPackages();
      await fetchExtensions();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, [updateInstalledPackages, fetchExtensions]);

  useEffect(() => {
    console.log('Current extension repos:', repos);
    console.log('Cached extensions count:', extensions.length);
    if (repos.length === 0) {
      setExtensions([]);
      return;
    }
    const cached = getCachedExtensions();
    if (cached) {
      setExtensions(cached.extensions);
    } else {
      fetchExtensions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  if (showRepoScreen) {
    return (
      <ExtensionReposScreen repos={repos} onReposChange={setRepos} onBack={() => setShowRepoScreen(false)} />
    );
  }

  const filtered = extensions.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Extensions</Text>
      </View>

      <View style={styles.tabs}>
        {(['installed', 'browse'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'installed' ? 'Sources' : 'Browse'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'installed' && (() => {
        const installedList = extensions.filter(e => installedPackages.has(e.pkgName));
        if (installedList.length === 0) {
          return (
            <View style={styles.emptyState}>
              <Package size={40} color={colors.border} />
              <Text style={styles.emptyText}>No extensions installed</Text>
              <Text style={styles.emptySubtext}>Extensions you install from Browse will appear here</Text>
            </View>
          );
        }
        return (
          <FlatList
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 96, gap: 8 }}
            data={installedList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} tintColor={colors.accent} />
            }
            keyExtractor={(ext) => `installed:${ext.pkgName}`}
            renderItem={({ item: ext }) => (
              <TouchableOpacity
                style={styles.extRow}
                activeOpacity={0.7}
                onPress={async () => {
                  try {
                    let sourceInfo: SourceInfo | null = null;
                    try { sourceInfo = await getSourceInfo(ext.pkgName); } catch { /* fall back to ext metadata */ }
                    onOpenSource({
                      pkgName: ext.pkgName,
                      sourceName: sourceInfo?.name ?? ext.sources[0]?.name ?? ext.name,
                      lang: sourceInfo?.lang ?? ext.lang,
                      baseUrl: sourceInfo?.baseUrl ?? '',
                    });
                  } catch (e) {
                    console.error('Failed to open source:', e);
                  }
                }}
                onLongPress={() => {
                  Alert.alert(`Uninstall ${ext.name}?`, undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Uninstall',
                      style: 'destructive',
                      onPress: () => uninstallPackage(ext.pkgName).catch((e) => console.error('Uninstall failed:', e)),
                    },
                  ]);
                }}
              >
                <ExtensionIcon ext={ext} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.extNameRow}>
                    <Text style={styles.extName}>{ext.name}</Text>
                    {ext.isNsfw && (
                      <View style={styles.nsfwBadge}>
                        <Text style={styles.nsfwText}>18+</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.extMeta}>
                    {ext.lang} · v{ext.versionName}
                    {ext.sources.length > 0 ? ` · ${ext.sources.length} source${ext.sources.length === 1 ? '' : 's'}` : ''}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textDim} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}
          />
        );
      })()}

      {activeTab === 'browse' && (
        <>
          <TouchableOpacity style={styles.repoHeader} onPress={() => setShowRepoScreen(true)}>
            <Text style={styles.repoHeaderLabel}>Extension repos</Text>
            <View style={styles.repoHeaderRight}>
              <Text style={styles.repoHeaderCount}>{repos.length} repos</Text>
              <ChevronRight size={14} color={colors.textFaint} />
            </View>
          </TouchableOpacity>

          {repos.length > 0 && (
            <View style={styles.searchWrap}>
              <Search size={15} color={colors.textFaint} style={styles.searchIcon} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search available..."
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
              />
              <TouchableOpacity onPress={fetchExtensions} style={styles.refreshButton}>
                <RefreshCw size={15} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {repos.length === 0 && (
            <View style={styles.emptyState}>
              <Package size={40} color={colors.border} />
              <Text style={styles.emptyText}>No repositories configured</Text>
              <Text style={styles.emptySubtext}>Add a repo URL ending in index.min.json to browse extensions</Text>
              <TouchableOpacity style={styles.addRepoCta} onPress={() => setShowRepoScreen(true)}>
                <Text style={styles.addRepoCtaText}>Add Repository</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Fetching extensions...</Text>
            </View>
          )}

          {!loading && repos.length > 0 && (
            // Virtualized: Keiyoushi-sized repos (700+ extensions) rendered as a plain
            // ScrollView mounted every row and its icon Image at once, which is what
            // triggered the ANR. FlatList only renders what's near the viewport.
            <FlatList
              style={styles.list}
              contentContainerStyle={{ paddingBottom: 96, gap: 8 }}
              data={filtered}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} tintColor={colors.accent} />
              }
              keyExtractor={(ext) => `${ext.repoUrl}:${ext.pkgName}`}
              ListHeaderComponent={
                errors.length > 0 ? (
                  <View style={{ gap: 8, marginBottom: 8 }}>
                    {errors.map((e) => (
                      <View key={e.repoUrl} style={styles.errorRow}>
                        <AlertTriangle size={14} color={colors.danger} />
                        <Text style={styles.errorText} numberOfLines={2}>
                          {e.repoUrl}: {e.error}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null
              }
              ListEmptyComponent={
                errors.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Package size={40} color={colors.border} />
                    <Text style={styles.emptyText}>No extensions found</Text>
                  </View>
                ) : null
              }
              renderItem={({ item: ext }) => (
                <View style={styles.extRow}>
                  <ExtensionIcon ext={ext} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.extNameRow}>
                      <Text style={styles.extName}>{ext.name}</Text>
                      {ext.isNsfw && (
                        <View style={styles.nsfwBadge}>
                          <Text style={styles.nsfwText}>18+</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.extMeta}>
                      {ext.lang} · v{ext.versionName}
                      {ext.sources.length > 0 ? ` · ${ext.sources.length} source${ext.sources.length === 1 ? '' : 's'}` : ''}
                    </Text>
                  </View>
                  <InstallButton 
                    ext={ext} 
                    isInstalled={installedPackages.has(ext.pkgName)} 
                    onInstalledRefresh={updateInstalledPackages} 
                  />
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 4, backgroundColor: colors.surface },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  repoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, marginHorizontal: 16, borderRadius: 12, backgroundColor: colors.surface, marginBottom: 12 },
  repoHeaderLabel: { color: colors.text, fontSize: 13 },
  repoHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repoHeaderCount: { color: colors.textMuted, fontSize: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
  searchInput: { flex: 1, backgroundColor: colors.surface, color: colors.text, fontSize: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingLeft: 36, paddingRight: 16, paddingVertical: 10 },
  refreshButton: { padding: 10, borderRadius: 12, backgroundColor: colors.surface },
  list: { flex: 1, paddingHorizontal: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)' },
  errorText: { flex: 1, color: colors.danger, fontSize: 11 },
  extRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.surface },
  extIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  extIconImage: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.border },
  extIconText: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  extNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  extName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  nsfwBadge: { backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  nsfwText: { color: colors.danger, fontSize: 9 },
  extMeta: { color: colors.textFaint, fontSize: 11 },
  installButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a3a2a',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  progressButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a3a2a',
  },
  errorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8, paddingHorizontal: 32 },
  emptyText: { color: colors.textDim, fontSize: 14, fontWeight: '500' },
  emptySubtext: { color: '#374151', fontSize: 12, textAlign: 'center' },
  addRepoCta: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent },
  addRepoCtaText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  installedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  installedBadgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
});
