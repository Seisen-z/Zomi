import { Chapter, createChapter, createManga, Manga, MangaStatus } from './models';
import { SourceChapter, SourceManga } from './sources/types';

// Bridges a real Zomi JS source's results (see sources/types.ts) into the domain layer —
// the JS-source equivalent of extensionSourceAdapter.ts. domain Manga.source is set directly
// to the MangaSource's own id (e.g. "mangadex"), used later to look it up via getSourceById.
const statusMap: Record<SourceManga['status'], MangaStatus> = {
  ongoing: MangaStatus.Ongoing,
  completed: MangaStatus.Completed,
  hiatus: MangaStatus.OnHiatus,
  cancelled: MangaStatus.Cancelled,
  unknown: MangaStatus.Unknown,
};

export function jsSourceMangaToDomain(sourceId: string, manga: SourceManga): Manga {
  return createManga({
    id: `${sourceId}:${manga.url}`,
    source: sourceId,
    url: manga.url,
    title: manga.title,
    artist: manga.artist,
    author: manga.author,
    description: manga.description,
    genre: manga.genres,
    status: statusMap[manga.status],
    thumbnailUrl: manga.thumbnailUrl,
    initialized: true,
  });
}

export function jsSourceChaptersToDomain(mangaId: string, chapters: SourceChapter[]): Chapter[] {
  return chapters.map((c, idx) =>
    createChapter({
      id: `${mangaId}:${c.url}`,
      mangaId,
      url: c.url,
      name: c.name,
      chapterNumber: c.chapterNumber,
      dateUpload: c.dateUpload,
      scanlator: c.scanlator,
      sourceOrder: chapters.length - idx,
    }),
  );
}
