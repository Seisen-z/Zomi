import { MangaPageResult, MangaSource, SourceChapter, SourceManga, SourcePage } from './types';

// A real, working Zomi source: fetches directly from MangaDex's public REST API
// (https://api.mangadex.org) — genuine JSON responses, no scraping, no extension APKs,
// no Tachiyomi dependency of any kind. This is "our own logic," as requested.
const API_BASE = 'https://api.mangadex.org';
const COVER_BASE = 'https://uploads.mangadex.org/covers';
const PAGE_LIMIT = 20;

interface MangaDexTag {
  attributes: { name: Record<string, string>; group: string };
}

interface MangaDexRelationship {
  id: string;
  type: string;
  attributes?: { name?: string; fileName?: string };
}

interface MangaDexMangaAttributes {
  title: Record<string, string>;
  altTitles: Record<string, string>[];
  description: Record<string, string>;
  status: string;
  tags: MangaDexTag[];
}

interface MangaDexManga {
  id: string;
  attributes: MangaDexMangaAttributes;
  relationships: MangaDexRelationship[];
}

interface MangaDexListResponse<T> {
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

function pickTitle(title: Record<string, string>): string {
  return title.en ?? Object.values(title)[0] ?? 'Untitled';
}

function pickDescription(description: Record<string, string>): string | undefined {
  return description.en ?? Object.values(description)[0];
}

function mapStatus(status: string): SourceManga['status'] {
  switch (status) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function mangaToSourceManga(manga: MangaDexManga): SourceManga {
  const author = manga.relationships.find((r) => r.type === 'author')?.attributes?.name;
  const artist = manga.relationships.find((r) => r.type === 'artist')?.attributes?.name;
  const coverFile = manga.relationships.find((r) => r.type === 'cover_art')?.attributes?.fileName;
  const genres = manga.attributes.tags
    .filter((t) => t.attributes.group === 'genre')
    .map((t) => t.attributes.name.en ?? Object.values(t.attributes.name)[0])
    .filter((g): g is string => !!g);

  return {
    url: manga.id,
    title: pickTitle(manga.attributes.title),
    author,
    artist,
    description: pickDescription(manga.attributes.description),
    genres,
    status: mapStatus(manga.attributes.status),
    thumbnailUrl: coverFile ? `${COVER_BASE}/${manga.id}/${coverFile}.256.jpg` : undefined,
  };
}

async function fetchMangaList(params: Record<string, string | string[]>, page: number): Promise<MangaPageResult> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => query.append(key, v));
    } else {
      query.append(key, value);
    }
  }
  query.append('limit', String(PAGE_LIMIT));
  query.append('offset', String((page - 1) * PAGE_LIMIT));
  query.append('includes[]', 'cover_art');
  query.append('includes[]', 'author');
  query.append('includes[]', 'artist');
  query.append('contentRating[]', 'safe');
  query.append('contentRating[]', 'suggestive');

  const response = await fetch(`${API_BASE}/manga?${query.toString()}`);
  if (!response.ok) throw new Error(`MangaDex returned ${response.status} ${response.statusText}`);
  const json = (await response.json()) as MangaDexListResponse<MangaDexManga>;

  return {
    manga: json.data.map(mangaToSourceManga),
    hasNextPage: json.offset + json.data.length < json.total,
  };
}

interface MangaDexChapterAttributes {
  chapter: string | null;
  title: string | null;
  translatedLanguage: string;
  publishAt: string;
  externalUrl: string | null;
  scanlationGroup?: string;
}

interface MangaDexChapter {
  id: string;
  attributes: MangaDexChapterAttributes;
  relationships: MangaDexRelationship[];
}

interface MangaDexAtHomeResponse {
  baseUrl: string;
  chapter: { hash: string; data: string[] };
}

export const mangadexSource: MangaSource = {
  id: 'mangadex',
  name: 'MangaDex',
  lang: 'en',

  getPopular(page) {
    return fetchMangaList({ 'order[followedCount]': 'desc' }, page);
  },

  getLatest(page) {
    return fetchMangaList({ 'order[latestUploadedChapter]': 'desc' }, page);
  },

  search(query, page) {
    return fetchMangaList(query.trim() ? { title: query.trim() } : {}, page);
  },

  async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
    const chapters: SourceChapter[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const query = new URLSearchParams();
      query.append('translatedLanguage[]', 'en');
      query.append('order[chapter]', 'desc');
      query.append('limit', String(limit));
      query.append('offset', String(offset));
      query.append('includes[]', 'scanlation_group');

      const response = await fetch(`${API_BASE}/manga/${mangaUrl}/feed?${query.toString()}`);
      if (!response.ok) throw new Error(`MangaDex returned ${response.status} ${response.statusText}`);
      const json = (await response.json()) as MangaDexListResponse<MangaDexChapter>;

      const mapped = json.data
        .filter((c) => c.attributes.translatedLanguage === 'en' && !c.attributes.externalUrl)
        .map((c) => {
          const group = c.relationships.find((r) => r.type === 'scanlation_group')?.attributes?.name;
          const num = c.attributes.chapter ? Number(c.attributes.chapter) : -1;
          return {
            url: c.id,
            name: c.attributes.title ? `Ch. ${c.attributes.chapter ?? '?'} - ${c.attributes.title}` : `Chapter ${c.attributes.chapter ?? '?'}`,
            chapterNumber: Number.isNaN(num) ? -1 : num,
            dateUpload: Date.parse(c.attributes.publishAt) || Date.now(),
            scanlator: group,
          };
        });

      chapters.push(...mapped);
      offset += limit;
      hasMore = offset < json.total;
    }

    return chapters;
  },

  async getPageList(chapterUrl: string): Promise<SourcePage[]> {
    const response = await fetch(`${API_BASE}/at-home/server/${chapterUrl}`);
    if (!response.ok) throw new Error(`MangaDex returned ${response.status} ${response.statusText}`);
    const json = (await response.json()) as MangaDexAtHomeResponse;

    return json.chapter.data.map((filename, index) => ({
      index,
      imageUrl: `${json.baseUrl}/data/${json.chapter.hash}/${filename}`,
    }));
  },
};
