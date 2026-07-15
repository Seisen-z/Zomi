import ReactNativeBlobUtil from 'react-native-blob-util';

// Same cache dir TachiyomiPageImageManager.kt caches reader page images to
// (`view.context.cacheDir/reader_pages`, i.e. Android's app cache dir — RNBU's CacheDir).
const READER_CACHE_DIR = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/reader_pages`;

export async function getReaderCacheSizeBytes(): Promise<number> {
  const { fs } = ReactNativeBlobUtil;
  if (!(await fs.exists(READER_CACHE_DIR))) return 0;
  const files = await fs.ls(READER_CACHE_DIR);
  let total = 0;
  for (const name of files) {
    try {
      const stat = await fs.stat(`${READER_CACHE_DIR}/${name}`);
      total += stat.size;
    } catch {
      // file could've been removed concurrently — skip it
    }
  }
  return total;
}

export async function clearReaderCache(): Promise<void> {
  const { fs } = ReactNativeBlobUtil;
  if (await fs.exists(READER_CACHE_DIR)) await fs.unlink(READER_CACHE_DIR);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
