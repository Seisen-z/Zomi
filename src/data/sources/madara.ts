import { MangaPageResult, MangaSource, SourceChapter, SourceManga, SourcePage } from './types';

// A GENERIC source template for "Madara" — a WordPress theme used by a large fraction of the
// manga/manhwa sites in the Keiyoushi extension repo (each such extension is essentially the
// same scraping logic with a different baseUrl). Rather than hand-writing one Zomi source file
// per Madara site, this factory takes {id, name, baseUrl} and produces a real, working
// MangaSource against that site's real Madara HTML — this is what scales past a handful of
// one-off sources like Asura Scans/MangaDex.
//
// Structure is the well-established, widely-documented Madara plugin layout, not scraped from
// a specific site's rendered output:
//  - listing: GET {baseUrl}/manga/?page=N (&m_orderby=trending|latest, &s=query for search)
//  - detail:  GET {baseUrl}/manga/{slug}/
//  - chapters: POST {baseUrl}/wp-admin/admin-ajax.php  action=manga_get_chapters&manga={postId}
//  - pages:   GET {baseUrl}/manga/{slug}/{chapterSlug}/  — images in .reading-content img

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&#8217;/g, "'").replace(/&amp;/g, '&').trim();
}

function extractAll(html: string, regex: RegExp): RegExpMatchArray[] {
  return [...html.matchAll(regex)];
}

interface MadaraConfig {
  id: string;
  name: string;
  lang: string;
  baseUrl: string;
}

export function createMadaraSource(config: MadaraConfig): MangaSource {
  const { id, name, lang, baseUrl } = config;

  async function fetchListing(params: string, page: number): Promise<MangaPageResult> {
    const response = await fetch(`${baseUrl}/manga/?page=${page}${params}`, { headers: HEADERS });
    if (!response.ok) throw new Error(`${name} returned ${response.status} ${response.statusText}`);
    const html = await response.text();

    // Each listing card: <div class="bsx"><a href=".../manga/{slug}/" title="Title">
    //   <img ... data-src="cover"/ or src="cover"></a>...</div>
    const cardRegex = /<div class="bsx">\s*<a href="([^"]+)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/g;
    const manga: SourceManga[] = extractAll(html, cardRegex).map((m) => ({
      url: m[1].replace(baseUrl, ''),
      title: stripTags(m[2]),
      thumbnailUrl: m[3],
      status: 'unknown',
    }));

    const hasNextPage = /class="[^"]*next[^"]*page-numbers/.test(html);
    return { manga, hasNextPage };
  }

  return {
    id,
    name,
    lang,

    getPopular(page) {
      return fetchListing('&m_orderby=trending', page);
    },

    getLatest(page) {
      return fetchListing('&m_orderby=latest', page);
    },

    async search(query, page) {
      const response = await fetch(`${baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga&page=${page}`, {
        headers: HEADERS,
      });
      if (!response.ok) throw new Error(`${name} returned ${response.status} ${response.statusText}`);
      const html = await response.text();
      const cardRegex = /<div class="bsx">\s*<a href="([^"]+)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/g;
      const manga: SourceManga[] = extractAll(html, cardRegex).map((m) => ({
        url: m[1].replace(baseUrl, ''),
        title: stripTags(m[2]),
        thumbnailUrl: m[3],
        status: 'unknown',
      }));
      const hasNextPage = /class="[^"]*next[^"]*page-numbers/.test(html);
      return { manga, hasNextPage };
    },

    async getChapterList(mangaUrl: string): Promise<SourceChapter[]> {
      const detailResponse = await fetch(`${baseUrl}${mangaUrl}`, { headers: HEADERS });
      if (!detailResponse.ok) throw new Error(`${name} returned ${detailResponse.status} ${detailResponse.statusText}`);
      const detailHtml = await detailResponse.text();

      const postIdMatch = detailHtml.match(/data-id="(\d+)"|post_id["\s:=]+(\d+)/);
      const postId = postIdMatch?.[1] ?? postIdMatch?.[2];
      if (!postId) throw new Error(`Could not find post id for ${mangaUrl}`);

      const chaptersResponse = await fetch(`${baseUrl}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=manga_get_chapters&manga=${postId}`,
      });
      if (!chaptersResponse.ok) throw new Error(`${name} returned ${chaptersResponse.status} ${chaptersResponse.statusText}`);
      const chaptersHtml = await chaptersResponse.text();

      const chapterRegex = /<a href="([^"]+)">\s*([^<]+)<\/a>[\s\S]*?<i[^>]*>([^<]*)<\/i>/g;
      const chapters = extractAll(chaptersHtml, chapterRegex).map((m) => {
        const chapterName = stripTags(m[2]);
        const numMatch = chapterName.match(/(\d+(\.\d+)?)/);
        return {
          url: m[1].replace(baseUrl, ''),
          name: chapterName,
          chapterNumber: numMatch ? Number(numMatch[1]) : -1,
          dateUpload: Date.parse(m[3]) || Date.now(),
        };
      });
      // Madara's chapter AJAX response lists newest first; reverse to number them in reading order.
      chapters.reverse();
      return chapters.map((c, idx) => (c.chapterNumber >= 0 ? c : { ...c, chapterNumber: idx + 1 }));
    },

    async getPageList(chapterUrl: string): Promise<SourcePage[]> {
      const response = await fetch(`${baseUrl}${chapterUrl}`, { headers: HEADERS });
      if (!response.ok) throw new Error(`${name} returned ${response.status} ${response.statusText}`);
      const html = await response.text();

      const imgRegex = /<div class="reading-content">[\s\S]*?<\/div>\s*<\/div>/;
      const readingBlock = html.match(imgRegex)?.[0] ?? html;
      const srcRegex = /<img[^>]+(?:data-src|src)="([^"]+)"/g;
      return extractAll(readingBlock, srcRegex).map((m, index) => ({
        index,
        imageUrl: m[1].trim(),
      }));
    },
  };
}
