// Zomi's own source interface — plain fetch + parse logic written in TypeScript, no Kotlin,
// no reflection, no dependency on Tachiyomi's compiled extension bytecode. A "source" here is
// just an object implementing these methods against a real site's real public API/HTML.
export interface SourceManga {
  url: string;
  title: string;
  artist?: string;
  author?: string;
  description?: string;
  genres?: string[];
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
  thumbnailUrl?: string;
}

export interface SourceChapter {
  url: string;
  name: string;
  chapterNumber: number;
  dateUpload: number;
  scanlator?: string;
}

export interface SourcePage {
  index: number;
  imageUrl: string;
  // Some sources (e.g. Asura Scans) return the page's real pixel dimensions up front. When
  // present, the reader uses this to size a Long strip page correctly from the very first frame
  // instead of guessing a normal-page aspect ratio and waiting for the native view to report back
  // — the raw scans this matters most for (very tall, narrow strips) are exactly the ones a wrong
  // guess distorts the most.
  width?: number;
  height?: number;
}

export interface MangaPageResult {
  manga: SourceManga[];
  hasNextPage: boolean;
}

export interface MangaSource {
  id: string;
  name: string;
  lang: string;
  // Some sources' image CDNs enforce hotlink protection (reject/truncate requests missing a
  // Referer matching the actual chapter page on the site's frontend, not just the bare domain).
  // Sent only when downloading/caching page images.
  getImageHeaders?(chapterUrl: string): Record<string, string>;
  getPopular(page: number): Promise<MangaPageResult>;
  getLatest(page: number): Promise<MangaPageResult>;
  search(query: string, page: number): Promise<MangaPageResult>;
  getChapterList(mangaUrl: string): Promise<SourceChapter[]>;
  getPageList(chapterUrl: string): Promise<SourcePage[]>;
}
