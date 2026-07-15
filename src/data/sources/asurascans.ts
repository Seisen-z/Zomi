import { MangaPageResult, MangaSource, SourceChapter, SourceManga, SourcePage } from './types';

// A real, working Zomi source for Asura Scans. Found by directly inspecting the site's own
// network requests (api.asurascans.com is preconnected from the page's <head>) rather than
// scraping HTML — it's a genuine public JSON API. Pure TypeScript, no Kotlin, no extension APK.
const API_BASE = 'https://api.asurascans.com/api';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

interface AsuraGenre {
  id: number;
  name: string;
  slug: string;
}

interface AsuraSeries {
  id: number;
  slug: string;
  title: string;
  description: string;
  cover: string;
  status: string;
  type: string;
  genres: AsuraGenre[];
}

interface AsuraListResponse {
  data: AsuraSeries[];
  meta: { meta: { total: number; per_page: number; has_more: boolean } };
}

interface AsuraChapter {
  id: number;
  number: number;
  slug: string;
  page_count: number;
  published_at: string;
}

interface AsuraChaptersResponse {
  data: AsuraChapter[];
}

interface AsuraChapterDetailResponse {
  data: {
    chapter: {
      pages: { url: string; width?: number; height?: number }[];
    };
  };
}

function mapStatus(status: string): SourceManga['status'] {
  switch (status) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'dropped':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

function seriesToSourceManga(series: AsuraSeries): SourceManga {
  return {
    url: series.slug,
    title: series.title,
    description: decodeHtmlEntities(series.description.replace(/<[^>]+>/g, '')).trim(),
    genres: series.genres.map((g) => g.name),
    status: mapStatus(series.status),
    thumbnailUrl: series.cover,
  };
}

async function fetchSeriesList(params: Record<string, string>): Promise<MangaPageResult> {
  const query = new URLSearchParams(params);
  const response = await fetch(`${API_BASE}/series?${query.toString()}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`Asura Scans returned ${response.status} ${response.statusText}`);
  const json = (await response.json()) as AsuraListResponse;

  return {
    manga: (json.data ?? []).map(seriesToSourceManga),
    hasNextPage: json.meta?.meta?.has_more ?? false,
  };
}

export const asuraScansSource: MangaSource = {
  id: 'asurascans',
  name: 'Asura Scans',
  lang: 'en',
  // cdn.asurascans.com truncates/resets image responses whose Referer doesn't point at the
  // actual chapter page on the site's frontend (asuracomic.net) — a bare root-domain Referer
  // isn't enough, it has to be the real series page the image is embedded on.
  getImageHeaders(chapterUrl) {
    const [mangaSlug] = chapterUrl.split('/');
    return { Referer: `https://asuracomic.net/series/${mangaSlug}` };
  },

  getPopular(page) {
    return fetchSeriesList({ page: String(page) });
  },

  getLatest(page) {
    return fetchSeriesList({ sort: 'latest', page: String(page) });
  },

  search(query, page) {
    return fetchSeriesList({ search: query, page: String(page) });
  },

  async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
    const response = await fetch(`${API_BASE}/series/${mangaUrl}/chapters`, { headers: HEADERS });
    if (!response.ok) throw new Error(`Asura Scans returned ${response.status} ${response.statusText}`);
    const json = (await response.json()) as AsuraChaptersResponse;

    return (json.data ?? []).map((c) => ({
      url: `${mangaUrl}/${c.slug}`,
      name: `Chapter ${c.number}`,
      chapterNumber: c.number,
      dateUpload: Date.parse(c.published_at) || Date.now(),
    }));
  },

  async getPageList(chapterUrl: string): Promise<SourcePage[]> {
    // chapterUrl is "{mangaSlug}/{chapterSlug}" (see getChapterList).
    const [mangaSlug, chapterSlug] = chapterUrl.split('/');
    const response = await fetch(`${API_BASE}/series/${mangaSlug}/chapters/${chapterSlug}`, { headers: HEADERS });
    if (!response.ok) throw new Error(`Asura Scans returned ${response.status} ${response.statusText}`);
    const json = (await response.json()) as AsuraChapterDetailResponse;

    const pages = json.data?.chapter?.pages;
    if (!pages) {
      // Newest chapters on Asura Scans are often locked behind coins/subscription — the API
      // still returns the chapter but with no `pages` array instead of an HTTP error.
      throw new Error('This chapter is locked (premium/early access) and has no pages available.');
    }

    return pages.map((page, index) => ({
      index,
      imageUrl: page.url,
      width: page.width,
      height: page.height,
    }));
  },
};
