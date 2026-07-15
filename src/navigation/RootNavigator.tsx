import React, { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Library, Compass, Download, Puzzle, MoreHorizontal } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { useThemeColors } from '../theme/useThemeColors';
import { getAppPreferences } from '../data/appPreferences';
import { hasPin, verifyPin } from '../data/appLock';
import { initOAuthDeepLinkListener } from '../data/trackers/oauthDeepLink';
import { LockScreen } from '../components/LockScreen';
import { Manga } from '../data/models';
import { addChapters, getChaptersByMangaId } from '../data/repository';
import { networkToLocalManga } from '../data/interactors';
import { jsSourceMangaToDomain, jsSourceChaptersToDomain } from '../data/jsSourceAdapter';
import { MangaSource, SourceManga as JsSourceManga } from '../data/sources/types';
import { resolveSourceForExtension, rehydrateInstalledSources } from '../data/sources/registry';
import { getUnseenLibraryMangaCount, subscribeToLibraryUpdates } from '../data/libraryUpdater';
import { LibraryScreen } from '../screens/LibraryScreen';
import { BrowseScreen } from '../screens/BrowseScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import { ExtensionsScreen, OpenSourceParams } from '../screens/ExtensionsScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { MangaDetailScreen } from '../screens/MangaDetailScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { SourceCatalogScreen } from '../screens/SourceCatalogScreen';

type Tab = 'library' | 'browse' | 'downloads' | 'extensions' | 'more';

type Screen =
  | { type: 'tab' }
  | { type: 'manga-detail'; manga: Manga }
  | { type: 'source-catalog'; source: MangaSource }
  | { type: 'reader'; manga: Manga; chapterIndex: number };

const tabs: { id: Tab; label: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { id: 'library', label: 'Library', Icon: Library },
  { id: 'browse', label: 'Browse', Icon: Compass },
  { id: 'downloads', label: 'Downloads', Icon: Download },
  { id: 'extensions', label: 'Extensions', Icon: Puzzle },
  { id: 'more', label: 'More', Icon: MoreHorizontal },
];

export function RootNavigator() {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('library');
  // A real history stack (not a single flat value) — otherwise "back" from a screen several
  // levels deep (e.g. Browse tab -> source-catalog -> manga-detail) has no way to know what was
  // underneath it and can only fall back to the tab root, skipping intermediate screens.
  const [screenStack, setScreenStack] = useState<Screen[]>([{ type: 'tab' }]);
  const screen = screenStack[screenStack.length - 1];
  const pushScreen = (next: Screen) => setScreenStack((stack) => [...stack, next]);

  const appLockActive = () => getAppPreferences().appLockEnabled && hasPin();
  const [locked, setLocked] = useState(appLockActive);
  const wasBackgrounded = useRef(false);

  const [unseenCount, setUnseenCount] = useState(getUnseenLibraryMangaCount);
  useEffect(() => subscribeToLibraryUpdates(() => setUnseenCount(getUnseenLibraryMangaCount())), []);

  // Re-lock whenever the app comes back from the background (not just on cold start) — same as
  // real Tachiyomi's App Lock, which re-prompts every time the app is reopened, not just once.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        wasBackgrounded.current = true;
      } else if (state === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        if (appLockActive()) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => initOAuthDeepLinkListener(), []);
  useEffect(() => {
    rehydrateInstalledSources();
  }, []);

  if (locked) {
    return (
      <LockScreen
        mode="unlock"
        onSubmit={(pin) => {
          const ok = verifyPin(pin);
          if (ok) setLocked(false);
          return ok;
        }}
      />
    );
  }

  const handleSelectManga = (manga: Manga) => pushScreen({ type: 'manga-detail', manga });

  // Mirrors what opening a source result does in real Tachiyomi: convert the source's
  // in-memory demo catalog. Async because the chapter fetch is a genuine network call.
  const handleSelectJsSourceManga = async (source: MangaSource, manga: JsSourceManga) => {
    const domainManga = networkToLocalManga(jsSourceMangaToDomain(source.id, manga));
    if (getChaptersByMangaId(domainManga.id).length === 0) {
      try {
        const chapters = await source.getChapterList(manga.url);
        addChapters(domainManga.id, jsSourceChaptersToDomain(domainManga.id, chapters));
      } catch {
        // Leave the manga with zero chapters; MangaDetailScreen already shows an empty state.
      }
    }
    pushScreen({ type: 'manga-detail', manga: domainManga });
  };

  // Entry point from Extensions > Installed: resolve a real Zomi source for the tapped
  // extension (bespoke match by name, or the generic Madara template against its real
  // baseUrl) and open the same catalog screen real sources use. No Kotlin, no reflection.
  const handleOpenExtensionSource = (params: OpenSourceParams) => {
    const source = resolveSourceForExtension(params.pkgName, params.sourceName, params.lang, params.baseUrl);
    if (!source) {
      Alert.alert('Not supported yet', `${params.sourceName} isn't a Madara site and doesn't have a Zomi source yet.`);
      return;
    }
    pushScreen({ type: 'source-catalog', source });
  };

  const handleReadChapter = (manga: Manga, chapterIndex: number) =>
    pushScreen({ type: 'reader', manga, chapterIndex });
  const handleBack = () => {
    setScreenStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
  };

  // Routes Android hardware back through the same stack the on-screen back buttons use, so both
  // behave identically everywhere except the reader, which registers its own hardwareBackPress
  // listener (closes the settings sheet first) that takes priority while it's mounted — RN's
  // BackHandler dispatches to the most-recently-added listener first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screenStack.length > 1) {
        handleBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screenStack]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'library':
        return <LibraryScreen onSelectManga={handleSelectManga} />;
      case 'browse':
        return (
          <BrowseScreen
            onSelectManga={handleSelectJsSourceManga}
            onOpenSource={(source) => pushScreen({ type: 'source-catalog', source })}
          />
        );
      case 'downloads':
        return <DownloadsScreen />;
      case 'extensions':
        return <ExtensionsScreen onOpenSource={handleOpenExtensionSource} />;
      case 'more':
        return <MoreScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.content, screen.type !== 'reader' && { paddingTop: insets.top }]}>
        {screen.type === 'tab' && renderTabContent()}
        {screen.type === 'manga-detail' && (
          <MangaDetailScreen
            manga={screen.manga}
            onBack={handleBack}
            onReadChapter={(idx) => handleReadChapter(screen.manga, idx)}
          />
        )}
        {screen.type === 'source-catalog' && (
          <SourceCatalogScreen
            source={screen.source}
            onBack={handleBack}
            onSelectManga={handleSelectJsSourceManga}
          />
        )}
        {screen.type === 'reader' && (
          <ReaderScreen manga={screen.manga} chapterIndex={screen.chapterIndex} onBack={handleBack} />
        )}
      </View>

      {screen.type === 'tab' && (
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} style={styles.tabButton} onPress={() => setActiveTab(tab.id)}>
                <View>
                  <tab.Icon size={20} color={isActive ? themeColors.accent : colors.textDim} />
                  {tab.id === 'library' && unseenCount > 0 && (
                    <View style={[styles.tabBadge, { backgroundColor: themeColors.accent }]}>
                      <Text style={styles.tabBadgeText}>{unseenCount > 9 ? '9+' : unseenCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.tabLabel, { color: isActive ? themeColors.accent : colors.textDim, fontWeight: isActive ? '600' : '400' }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabButton: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  tabLabel: { fontSize: 10 },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
});
