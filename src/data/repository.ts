import { getJSON, setJSON } from './storage';
import { AvailableExtension, Category, Chapter, ChapterUpdate, LibraryManga, Manga, UNCATEGORIZED_ID } from './models';

// Ported from Trash/domain/src/main/java/tachiyomi/domain/manga/repository/MangaRepository.kt
const MANGA_KEY = 'library:manga';
const CATEGORIES_KEY = 'library:categories';
const MANGA_CATEGORIES_KEY = 'library:mangaCategories';
const EXTENSION_REPOS_KEY = 'extensions:repos';
const AVAILABLE_EXTENSIONS_CACHE_KEY = 'extensions:availableCache';
const chapterKey = (mangaId: string) => `chapters:${mangaId}`;

// Ported from Trash/app/src/main/java/eu/kanade/domain/extension/interactor/CreateExtensionRepo.kt
// Repos are stored as base URLs (the "/index.min.json" suffix is stripped, same as real Tachiyomi).
const REPO_URL_PATTERN = /^https:\/\/.*\/index\.min\.json$/;

export function getExtensionRepos(): string[] {
  return getJSON<string[]>(EXTENSION_REPOS_KEY, []);
}

export type CreateExtensionRepoResult = 'success' | 'invalid-url' | 'already-exists';

export function addExtensionRepo(url: string): CreateExtensionRepoResult {
  if (!REPO_URL_PATTERN.test(url)) return 'invalid-url';
  const baseUrl = url.replace(/\/index\.min\.json$/, '');
  const repos = getExtensionRepos();
  if (repos.includes(baseUrl)) return 'already-exists';
  setJSON(EXTENSION_REPOS_KEY, [...repos, baseUrl]);
  return 'success';
}

export function removeExtensionRepo(baseUrl: string): void {
  setJSON(EXTENSION_REPOS_KEY, getExtensionRepos().filter((r) => r !== baseUrl));
}

// Mirrors real Tachiyomi's daily-limited ExtensionApi.checkForUpdates: repos like Keiyoushi's
// index.min.json cover 700+ extensions, so re-parsing it on every screen visit is wasteful
// (and on a debug JS engine, slow enough to trip Android's ANR watchdog). Cache the parsed
// result and only require an explicit refresh to hit the network again.
interface AvailableExtensionsCache {
  fetchedAt: number;
  repos: string[];
  extensions: AvailableExtension[];
}

// Returns null if there's no cache, or if the configured repos have changed since it was fetched.
export function getCachedExtensions(): AvailableExtensionsCache | null {
  const cache = getJSON<AvailableExtensionsCache | null>(AVAILABLE_EXTENSIONS_CACHE_KEY, null);
  if (!cache) return null;
  const currentRepos = getExtensionRepos();
  const sameRepos = cache.repos.length === currentRepos.length && cache.repos.every((r) => currentRepos.includes(r));
  return sameRepos ? cache : null;
}

export function setCachedExtensions(extensions: AvailableExtension[]): void {
  setJSON(AVAILABLE_EXTENSIONS_CACHE_KEY, { fetchedAt: Date.now(), repos: getExtensionRepos(), extensions });
}

function getAllManga(): Manga[] {
  return getJSON<Manga[]>(MANGA_KEY, []);
}

function setAllManga(manga: Manga[]): void {
  setJSON(MANGA_KEY, manga);
}

export function getMangaById(id: string): Manga | undefined {
  return getAllManga().find((m) => m.id === id);
}

export function getMangaByUrlAndSourceId(url: string, sourceId: string): Manga | undefined {
  return getAllManga().find((m) => m.url === url && m.source === sourceId);
}

export function getFavorites(): Manga[] {
  return getAllManga().filter((m) => m.favorite);
}

export function getFavoritesBySourceId(sourceId: string): Manga[] {
  return getAllManga().filter((m) => m.favorite && m.source === sourceId);
}

export function getDuplicateLibraryManga(id: string, title: string): Manga[] {
  const normalized = title.toLowerCase();
  return getAllManga().filter((m) => m.favorite && m.id !== id && m.title.toLowerCase() === normalized);
}

export function insertManga(manga: Manga): void {
  const all = getAllManga();
  const index = all.findIndex((m) => m.id === manga.id);
  if (index >= 0) {
    all[index] = manga;
  } else {
    all.push(manga);
  }
  setAllManga(all);
}

export function updateManga(update: Partial<Manga> & { id: string }): void {
  const all = getAllManga();
  const index = all.findIndex((m) => m.id === update.id);
  if (index < 0) return;
  all[index] = { ...all[index], ...update, lastModifiedAt: Date.now() };
  setAllManga(all);
}

export function setMangaFavorite(id: string, favorite: boolean): void {
  updateManga({ id, favorite, favoriteModifiedAt: Date.now() });
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/category/repository/CategoryRepository.kt
export function getCategories(): Category[] {
  return getJSON<Category[]>(CATEGORIES_KEY, []);
}

export function getCategory(id: string): Category | undefined {
  return getCategories().find((c) => c.id === id);
}

export function insertCategory(category: Category): void {
  const all = getCategories();
  all.push(category);
  setJSON(CATEGORIES_KEY, all);
}

export function createCategory(name: string): Category {
  const category: Category = { id: Date.now().toString(), name, order: getCategories().length, flags: 0 };
  insertCategory(category);
  return category;
}

export function updateCategory(update: Partial<Category> & { id: string }): void {
  const all = getCategories();
  const index = all.findIndex((c) => c.id === update.id);
  if (index < 0) return;
  all[index] = { ...all[index], ...update };
  setJSON(CATEGORIES_KEY, all);
}

export function deleteCategory(categoryId: string): void {
  setJSON(CATEGORIES_KEY, getCategories().filter((c) => c.id !== categoryId));
  const mapping = getMangaCategoriesMap();
  for (const mangaId of Object.keys(mapping)) {
    mapping[mangaId] = mapping[mangaId].filter((id) => id !== categoryId);
  }
  setJSON(MANGA_CATEGORIES_KEY, mapping);
}

function getMangaCategoriesMap(): Record<string, string[]> {
  return getJSON<Record<string, string[]>>(MANGA_CATEGORIES_KEY, {});
}

export function getCategoriesByMangaId(mangaId: string): Category[] {
  const ids = getMangaCategoriesMap()[mangaId] ?? [UNCATEGORIZED_ID];
  const all = getCategories();
  return ids.map((id) => all.find((c) => c.id === id)).filter((c): c is Category => c != null);
}

export function setMangaCategories(mangaId: string, categoryIds: string[]): void {
  const mapping = getMangaCategoriesMap();
  mapping[mangaId] = categoryIds;
  setJSON(MANGA_CATEGORIES_KEY, mapping);
}

// The category a plain tap on the library-add button assigns to (vs. long-press, which opens
// the full category picker). Falls back to "Uncategorized" if never configured or the
// configured category was since deleted.
const DEFAULT_CATEGORY_KEY = 'library:defaultCategoryId';

export function getDefaultCategoryId(): string {
  const id = getJSON<string>(DEFAULT_CATEGORY_KEY, UNCATEGORIZED_ID);
  if (id === UNCATEGORIZED_ID) return id;
  return getCategory(id) ? id : UNCATEGORIZED_ID;
}

export function setDefaultCategoryId(id: string): void {
  setJSON(DEFAULT_CATEGORY_KEY, id);
}

// Per-manga chapter list sort direction (true = newest first) — same map-under-one-key shape as
// MANGA_CATEGORIES_KEY above, so it survives leaving and returning to a manga's detail screen.
const MANGA_CHAPTER_SORT_KEY = 'library:mangaChapterSort';

export function getChapterSortDescByMangaId(mangaId: string): boolean {
  return getJSON<Record<string, boolean>>(MANGA_CHAPTER_SORT_KEY, {})[mangaId] ?? true;
}

export function setChapterSortDescByMangaId(mangaId: string, desc: boolean): void {
  const map = getJSON<Record<string, boolean>>(MANGA_CHAPTER_SORT_KEY, {});
  map[mangaId] = desc;
  setJSON(MANGA_CHAPTER_SORT_KEY, map);
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/chapter/repository/ChapterRepository.kt
export function getChaptersByMangaId(mangaId: string): Chapter[] {
  return getJSON<Chapter[]>(chapterKey(mangaId), []);
}

export function getChapterById(mangaId: string, chapterId: string): Chapter | undefined {
  return getChaptersByMangaId(mangaId).find((c) => c.id === chapterId);
}

export function getChapterByUrlAndMangaId(url: string, mangaId: string): Chapter | undefined {
  return getChaptersByMangaId(mangaId).find((c) => c.url === url);
}

export function getBookmarkedChaptersByMangaId(mangaId: string): Chapter[] {
  return getChaptersByMangaId(mangaId).filter((c) => c.bookmark);
}

export function addChapters(mangaId: string, chapters: Chapter[]): void {
  const existing = getChaptersByMangaId(mangaId);
  setJSON(chapterKey(mangaId), [...existing, ...chapters]);
}

export function updateChapter(mangaId: string, update: ChapterUpdate): void {
  const chapters = getChaptersByMangaId(mangaId);
  const index = chapters.findIndex((c) => c.id === update.id);
  if (index < 0) return;
  chapters[index] = { ...chapters[index], ...update };
  setJSON(chapterKey(mangaId), chapters);
}

export function updateChapters(mangaId: string, updates: ChapterUpdate[]): void {
  const chapters = getChaptersByMangaId(mangaId);
  for (const update of updates) {
    const index = chapters.findIndex((c) => c.id === update.id);
    if (index >= 0) chapters[index] = { ...chapters[index], ...update };
  }
  setJSON(chapterKey(mangaId), chapters);
}

export function removeChaptersWithIds(mangaId: string, chapterIds: string[]): void {
  const chapters = getChaptersByMangaId(mangaId).filter((c) => !chapterIds.includes(c.id));
  setJSON(chapterKey(mangaId), chapters);
}

export function markChapterRead(mangaId: string, chapterId: string, read: boolean): void {
  updateChapter(mangaId, { id: chapterId, read });
}

export function setLastPageRead(mangaId: string, chapterId: string, page: number): void {
  updateChapter(mangaId, { id: chapterId, lastPageRead: page });
}

// More screen > Privacy > "Clear Reading History" — resets read/last-page-read across every
// library manga, not just the currently open one.
export function clearAllReadingHistory(): void {
  for (const manga of getFavorites()) {
    const chapters = getChaptersByMangaId(manga.id);
    updateChapters(
      manga.id,
      chapters.map((c) => ({ id: c.id, read: false, lastPageRead: 0 })),
    );
  }
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/manga/interactor/GetLibraryManga.kt
// LibraryManga is a computed aggregate: assembled from Manga + its Chapters, never stored directly.
export function getLibraryManga(): LibraryManga[] {
  return getFavorites().map((manga) => toLibraryManga(manga));
}

export function toLibraryManga(manga: Manga): LibraryManga {
  const chapters = getChaptersByMangaId(manga.id);
  const categories = getCategoriesByMangaId(manga.id);
  return {
    manga,
    category: categories[0]?.id ?? UNCATEGORIZED_ID,
    totalChapters: chapters.length,
    readCount: chapters.filter((c) => c.read).length,
    bookmarkCount: chapters.filter((c) => c.bookmark).length,
    latestUpload: chapters.reduce((max, c) => Math.max(max, c.dateUpload), 0),
    chapterFetchedAt: chapters.reduce((max, c) => Math.max(max, c.dateFetch), 0),
    lastRead: 0,
  };
}
