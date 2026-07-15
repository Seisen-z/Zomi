import { Manga } from './models';
import { getMangaByUrlAndSourceId, insertManga, updateManga } from './repository';

// Ported from Trash/domain/src/main/java/tachiyomi/domain/manga/interactor/NetworkToLocalManga.kt
// Reconciles a manga just fetched from a source with what's already stored locally, so
// opening the same source result twice never creates a duplicate local Manga.
export function networkToLocalManga(manga: Manga): Manga {
  const local = getMangaByUrlAndSourceId(manga.url, manga.source);
  if (!local) {
    insertManga(manga);
    return manga;
  }
  if (!local.favorite) {
    // Not favorited yet — keep the freshest title from the source, don't persist it until favorited.
    return { ...local, title: manga.title };
  }
  return local;
}

export function toggleFavorite(manga: Manga): Manga {
  const next = !manga.favorite;
  updateManga({ id: manga.id, favorite: next, favoriteModifiedAt: next ? Date.now() : undefined });
  return { ...manga, favorite: next };
}
