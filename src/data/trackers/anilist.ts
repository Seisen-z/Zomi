const ANILIST_CLIENT_ID = '45849';
const GRAPHQL_URL = 'https://graphql.anilist.co';

export function anilistAuthUrl(): string {
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;
}

async function anilistGraphql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message ?? 'AniList request failed');
  }
  if (!res.ok || !json.data) {
    throw new Error(`AniList request failed (${res.status})`);
  }
  return json.data as T;
}

export interface AnilistViewer {
  id: number;
  name: string;
}

export async function fetchAnilistViewer(token: string): Promise<AnilistViewer> {
  const data = await anilistGraphql<{ Viewer: AnilistViewer }>(token, `query { Viewer { id name } }`);
  return data.Viewer;
}

export interface AnilistSearchResult {
  id: number;
  title: string;
}

export async function searchAnilistManga(token: string, search: string): Promise<AnilistSearchResult[]> {
  const data = await anilistGraphql<{ Page: { media: { id: number; title: { userPreferred: string } }[] } }>(
    token,
    `query ($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: MANGA) {
          id
          title { userPreferred }
        }
      }
    }`,
    { search },
  );
  return data.Page.media.map((m) => ({ id: m.id, title: m.title.userPreferred }));
}

export async function updateAnilistProgress(token: string, mediaId: number, progress: number): Promise<void> {
  await anilistGraphql(
    token,
    `mutation ($mediaId: Int, $progress: Int) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: CURRENT) {
        id
      }
    }`,
    { mediaId, progress },
  );
}
