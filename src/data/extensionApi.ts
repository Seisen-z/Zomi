import { AvailableExtension } from './models';
import { getExtensionRepos } from './repository';

// Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/extension/api/ExtensionApi.kt
// Real fetch + parse of a repo's index.min.json — no mock data. The JSON shape and field
// mapping (name prefix strip, apk/icon URL construction, libVersion extraction) mirror the
// Kotlin ExtensionApi exactly, minus the LIB_VERSION_MIN/MAX compatibility filter (Zomi can't
// load any extension's actual code yet, so there's no "compatible" range to filter against).

interface ExtensionJson {
  name: string;
  pkg: string;
  apk: string;
  lang: string;
  code: number;
  version: string;
  nsfw: number;
  sources?: { id: number; lang: string; name: string; baseUrl: string }[];
}

function extractLibVersion(version: string): number {
  const idx = version.lastIndexOf('.');
  return idx < 0 ? NaN : Number(version.slice(0, idx));
}

function toExtensions(json: ExtensionJson[], repoUrl: string): AvailableExtension[] {
  return json.map((it) => ({
    name: it.name.replace(/^Tachiyomi: /, ''),
    pkgName: it.pkg,
    versionName: it.version,
    versionCode: it.code,
    libVersion: extractLibVersion(it.version),
    lang: it.lang,
    isNsfw: it.nsfw === 1,
    sources: (it.sources ?? []).map((s) => ({ id: s.id, lang: s.lang, name: s.name, baseUrl: s.baseUrl })),
    apkName: it.apk,
    iconUrl: `${repoUrl}/icon/${it.pkg}.png`,
    repoUrl,
  }));
}

export async function fetchExtensionsFromRepo(repoBaseUrl: string): Promise<AvailableExtension[]> {
  const response = await fetch(`${repoBaseUrl}/index.min.json`);
  if (!response.ok) {
    throw new Error(`Repo returned ${response.status} ${response.statusText}`);
  }
  const json = (await response.json()) as ExtensionJson[];
  return toExtensions(json, repoBaseUrl);
}

export interface RepoFetchResult {
  repoUrl: string;
  extensions: AvailableExtension[];
  error?: string;
}

export async function fetchAllAvailableExtensions(): Promise<RepoFetchResult[]> {
  const repos = getExtensionRepos();
  return Promise.all(
    repos.map(async (repoUrl): Promise<RepoFetchResult> => {
      try {
        return { repoUrl, extensions: await fetchExtensionsFromRepo(repoUrl) };
      } catch (e) {
        return { repoUrl, extensions: [], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}

export function getApkUrl(extension: AvailableExtension): string {
  return `${extension.repoUrl}/apk/${extension.apkName}`;
}
