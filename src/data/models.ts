// Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/extension/model/Extension.kt +
// eu/kanade/tachiyomi/extension/api/ExtensionApi.kt (Extension.Available shape, JS runtime cut).
export interface ExtensionSource {
  id: number;
  lang: string;
  name: string;
  baseUrl: string;
}

export interface AvailableExtension {
  name: string;
  pkgName: string;
  versionName: string;
  versionCode: number;
  libVersion: number;
  lang: string;
  isNsfw: boolean;
  sources: ExtensionSource[];
  apkName: string;
  iconUrl: string;
  repoUrl: string;
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/manga/model/Manga.kt
export interface Manga {
  id: string;
  source: string;
  favorite: boolean;
  lastUpdate: number;
  nextUpdate: number;
  fetchInterval: number;
  dateAdded: number;
  viewerFlags: number;
  chapterFlags: number;
  coverLastModified: number;
  url: string;
  title: string;
  artist?: string;
  author?: string;
  description?: string;
  genre?: string[];
  status: MangaStatus;
  thumbnailUrl?: string;
  updateStrategy: UpdateStrategy;
  initialized: boolean;
  lastModifiedAt: number;
  favoriteModifiedAt?: number;
}

export enum MangaStatus {
  Unknown = 0,
  Ongoing = 1,
  Completed = 2,
  Licensed = 3,
  PublishingFinished = 4,
  Cancelled = 5,
  OnHiatus = 6,
}

export enum UpdateStrategy {
  AlwaysUpdate = 'ALWAYS_UPDATE',
  OnlyFetchOnce = 'ONLY_FETCH_ONCE',
}

// Chapter list/display/filter/sort bitmask, ported from Manga.kt companion object.
export const ChapterFlags = {
  SHOW_ALL: 0x00000000,

  SORT_DESC: 0x00000000,
  SORT_ASC: 0x00000001,
  SORT_DIR_MASK: 0x00000001,

  SHOW_UNREAD: 0x00000002,
  SHOW_READ: 0x00000004,
  UNREAD_MASK: 0x00000006,

  SHOW_DOWNLOADED: 0x00000008,
  SHOW_NOT_DOWNLOADED: 0x00000010,
  DOWNLOADED_MASK: 0x00000018,

  SHOW_BOOKMARKED: 0x00000020,
  SHOW_NOT_BOOKMARKED: 0x00000040,
  BOOKMARKED_MASK: 0x00000060,

  SORTING_SOURCE: 0x00000000,
  SORTING_NUMBER: 0x00000100,
  SORTING_UPLOAD_DATE: 0x00000200,
  SORTING_ALPHABET: 0x00000300,
  SORTING_MASK: 0x00000300,

  DISPLAY_NAME: 0x00000000,
  DISPLAY_NUMBER: 0x00100000,
  DISPLAY_MASK: 0x00100000,
} as const;

export enum TriState {
  Disabled = 'DISABLED',
  EnabledIs = 'ENABLED_IS',
  EnabledNot = 'ENABLED_NOT',
}

export function sortDescending(manga: Manga): boolean {
  return (manga.chapterFlags & ChapterFlags.SORT_DIR_MASK) === ChapterFlags.SORT_DESC;
}

export function unreadFilter(manga: Manga): TriState {
  const raw = manga.chapterFlags & ChapterFlags.UNREAD_MASK;
  if (raw === ChapterFlags.SHOW_UNREAD) return TriState.EnabledIs;
  if (raw === ChapterFlags.SHOW_READ) return TriState.EnabledNot;
  return TriState.Disabled;
}

export function bookmarkedFilter(manga: Manga): TriState {
  const raw = manga.chapterFlags & ChapterFlags.BOOKMARKED_MASK;
  if (raw === ChapterFlags.SHOW_BOOKMARKED) return TriState.EnabledIs;
  if (raw === ChapterFlags.SHOW_NOT_BOOKMARKED) return TriState.EnabledNot;
  return TriState.Disabled;
}

export function createManga(overrides: Partial<Manga> & Pick<Manga, 'id' | 'source' | 'url' | 'title'>): Manga {
  return {
    favorite: false,
    lastUpdate: 0,
    nextUpdate: 0,
    fetchInterval: 0,
    dateAdded: 0,
    viewerFlags: 0,
    chapterFlags: 0,
    coverLastModified: 0,
    artist: undefined,
    author: undefined,
    description: undefined,
    genre: undefined,
    status: MangaStatus.Unknown,
    thumbnailUrl: undefined,
    updateStrategy: UpdateStrategy.AlwaysUpdate,
    initialized: false,
    lastModifiedAt: 0,
    favoriteModifiedAt: undefined,
    ...overrides,
  };
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/manga/model/MangaCover.kt
export interface MangaCover {
  mangaId: string;
  sourceId: string;
  isMangaFavorite: boolean;
  url?: string;
  lastModified: number;
}

export function asMangaCover(manga: Manga): MangaCover {
  return {
    mangaId: manga.id,
    sourceId: manga.source,
    isMangaFavorite: manga.favorite,
    url: manga.thumbnailUrl,
    lastModified: manga.coverLastModified,
  };
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/chapter/model/Chapter.kt
export interface Chapter {
  id: string;
  mangaId: string;
  read: boolean;
  bookmark: boolean;
  lastPageRead: number;
  dateFetch: number;
  sourceOrder: number;
  url: string;
  name: string;
  dateUpload: number;
  chapterNumber: number;
  scanlator?: string;
  lastModifiedAt: number;
}

export function isRecognizedNumber(chapter: Chapter): boolean {
  return chapter.chapterNumber >= 0;
}

export function createChapter(overrides: Partial<Chapter> & Pick<Chapter, 'id' | 'mangaId' | 'url' | 'name'>): Chapter {
  return {
    read: false,
    bookmark: false,
    lastPageRead: 0,
    dateFetch: 0,
    sourceOrder: 0,
    dateUpload: -1,
    chapterNumber: -1,
    scanlator: undefined,
    lastModifiedAt: 0,
    ...overrides,
  };
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/chapter/model/ChapterUpdate.kt
export type ChapterUpdate = Partial<Omit<Chapter, 'id'>> & { id: string };

export function toChapterUpdate(chapter: Chapter): ChapterUpdate {
  const { id, mangaId, read, bookmark, lastPageRead, dateFetch, sourceOrder, url, name, dateUpload, chapterNumber, scanlator } = chapter;
  return { id, mangaId, read, bookmark, lastPageRead, dateFetch, sourceOrder, url, name, dateUpload, chapterNumber, scanlator };
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/category/model/Category.kt
export const UNCATEGORIZED_ID = '0';

export interface Category {
  id: string;
  name: string;
  order: number;
  flags: number;
}

export function isSystemCategory(category: Category): boolean {
  return category.id === UNCATEGORIZED_ID;
}

// Category.flags is otherwise unused today — a bitfield here mirrors the ChapterFlags convention
// below instead of adding a second MMKV store just for one boolean.
export const CategoryFlags = {
  AUTO_DOWNLOAD_NEW_CHAPTERS: 0x1,
} as const;

export function isAutoDownloadCategory(category: Category): boolean {
  return (category.flags & CategoryFlags.AUTO_DOWNLOAD_NEW_CHAPTERS) !== 0;
}

export function withAutoDownloadFlag(category: Category, enabled: boolean): number {
  return enabled
    ? category.flags | CategoryFlags.AUTO_DOWNLOAD_NEW_CHAPTERS
    : category.flags & ~CategoryFlags.AUTO_DOWNLOAD_NEW_CHAPTERS;
}

// Ported from Trash/domain/src/main/java/tachiyomi/domain/library/model/LibraryManga.kt
// A computed aggregate, not stored directly — assembled from Manga + its Chapters at query time.
export interface LibraryManga {
  manga: Manga;
  category: string;
  totalChapters: number;
  readCount: number;
  bookmarkCount: number;
  latestUpload: number;
  chapterFetchedAt: number;
  lastRead: number;
}

export function libraryMangaId(libraryManga: LibraryManga): string {
  return libraryManga.manga.id;
}

export function unreadCount(libraryManga: LibraryManga): number {
  return libraryManga.totalChapters - libraryManga.readCount;
}

export function hasBookmarks(libraryManga: LibraryManga): boolean {
  return libraryManga.bookmarkCount > 0;
}

export function hasStarted(libraryManga: LibraryManga): boolean {
  return libraryManga.readCount > 0;
}
