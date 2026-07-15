import { MangaSource } from './types';
import { mangadexSource } from './mangadex';
import { asuraScansSource } from './asurascans';
import { createMadaraSource } from './madara';
import { getCachedExtensions } from '../repository';
import { getInstalledPackages } from '../extensionInstaller';

// The set of real, working Zomi sources. mangadexSource and asuraScansSource are bespoke
// (each site has its own non-template platform). Everything else routes through the generic
// Madara template (see madara.ts), which covers any Madara-based site from the extension
// repo's metadata (name + baseUrl) without needing a hand-written file per site.
export const sources: MangaSource[] = [mangadexSource, asuraScansSource];

// Madara sources are created on demand (see resolveSourceForExtension) since there's one per
// installed extension rather than a fixed list — cached here so a manga favorited from one can
// still be looked up later (e.g. by the Reader) without re-resolving it.
const dynamicSources = new Map<string, MangaSource>();

export function getSourceById(id: string): MangaSource | undefined {
  return sources.find((s) => s.id === id) ?? dynamicSources.get(id);
}

// Resolves a real Zomi source for an installed extension, given what we know about it from its
// APK metadata (name + baseUrl derived via SourceBridge). Bespoke sources are matched by name
// first; anything else falls back to the generic Madara template against that baseUrl, which
// works for any Madara-based site (a large fraction of the real extension repo) with zero
// per-site code.
export function resolveSourceForExtension(pkgName: string, sourceName: string, lang: string, baseUrl: string): MangaSource | null {
  const byName = sources.find((s) => s.name.toLowerCase() === sourceName.toLowerCase());
  if (byName) return byName;

  if (!baseUrl) return null;
  const cached = dynamicSources.get(pkgName);
  if (cached) return cached;

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const source = createMadaraSource({ id: pkgName, name: sourceName, lang, baseUrl: normalizedBaseUrl });
  dynamicSources.set(pkgName, source);
  return source;
}

export interface InstalledSourceInfo {
  source: MangaSource;
  iconUrl?: string;
}

// Browse's home screen (and anything else that lists sources without a specific extension
// context) must only show sources the user actually installed — not every bespoke source Zomi
// happens to have code for. "Installed" is cross-referenced the same way ExtensionsScreen does
// it: real installed Android packages matched against the cached repo metadata's pkgName. Bespoke
// sources are matched by name; anything else (the majority of the real extension repo) resolves
// through the same Madara fallback ExtensionsScreen uses when a user taps a source directly, so
// Browse's home screen actually reflects every installed extension, not just the 2 bespoke ones.
// Extensions with no cached metadata (repo never fetched) can't be resolved and are excluded.
// The extension's real iconUrl rides along so Browse can show the actual source icon.
export async function getInstalledSources(): Promise<InstalledSourceInfo[]> {
  const cached = getCachedExtensions();
  if (!cached || cached.extensions.length === 0) return [];
  const installedPkgs = new Set(await getInstalledPackages());
  const installedExtensions = cached.extensions.filter((e) => installedPkgs.has(e.pkgName));

  const results: InstalledSourceInfo[] = [];
  for (const ext of installedExtensions) {
    const bespoke = sources.find((s) => s.name.toLowerCase() === ext.name.toLowerCase());
    if (bespoke) {
      results.push({ source: bespoke, iconUrl: ext.iconUrl });
      continue;
    }
    const primary = ext.sources[0];
    if (!primary?.baseUrl) continue;
    const source = resolveSourceForExtension(ext.pkgName, primary.name || ext.name, primary.lang || ext.lang, primary.baseUrl);
    if (source) results.push({ source, iconUrl: ext.iconUrl });
  }
  return results;
}

// Called once at app startup (see RootNavigator) so getSourceById works for every installed
// extension's favorited manga immediately, without needing the user to first visit Browse or
// Extensions in that session — dynamicSources is in-memory only, so it doesn't survive an app
// restart on its own.
export async function rehydrateInstalledSources(): Promise<void> {
  await getInstalledSources();
}
