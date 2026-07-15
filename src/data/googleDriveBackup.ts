import { storage } from './storage';
import { refreshGoogleTokenIfNeeded } from './googleAuth';

export function createBackupData(): string {
  const keys = storage.getAllKeys();
  const kv: Record<string, string> = {};
  for (const key of keys) {
    // Exclude tokens and caches for security and performance
    if (
      key.startsWith('tracker:') ||
      key.startsWith('google:') ||
      key === 'extensions:availableCache'
    ) {
      continue;
    }
    const val = storage.getString(key);
    if (val !== undefined) {
      kv[key] = val;
    }
  }
  return JSON.stringify({
    version: 1,
    createdAt: Date.now(),
    kv,
  });
}

export async function findBackupFile(accessToken: string): Promise<{ id: string; name: string } | null> {
  const query = encodeURIComponent("name = 'zomi_backup.json' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? 'Failed to search Google Drive');
  }
  const json = await res.json();
  if (json.files && json.files.length > 0) {
    return json.files[0];
  }
  return null;
}

export async function uploadBackup(): Promise<void> {
  const accessToken = await refreshGoogleTokenIfNeeded();
  const file = await findBackupFile(accessToken);
  const backupContent = createBackupData();

  if (file) {
    // Overwrite existing backup file using PATCH (uploadType=media)
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: backupContent,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? 'Failed to update backup file');
    }
  } else {
    // Create new backup file using multipart POST
    const boundary = 'zomi_backup_boundary';
    const metadata = JSON.stringify({
      name: 'zomi_backup.json',
      mimeType: 'application/json',
    });

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      backupContent,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? 'Failed to create backup file');
    }
  }
}

export async function downloadAndRestoreBackup(): Promise<void> {
  const accessToken = await refreshGoogleTokenIfNeeded();
  const file = await findBackupFile(accessToken);
  if (!file) {
    throw new Error('No backup file found in Google Drive');
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Failed to download backup file');
  }
  const backupJsonStr = await res.text();

  const data = JSON.parse(backupJsonStr);
  if (!data || typeof data !== 'object' || !data.kv) {
    throw new Error('Invalid backup file content');
  }
  const kv = data.kv as Record<string, string>;

  // 1. Delete relevant app namespaces first to ensure clean state
  const keysToDelete = storage.getAllKeys().filter(
    (key) =>
      key === 'library:manga' ||
      key === 'library:categories' ||
      key === 'library:mangaCategories' ||
      key === 'library:defaultCategoryId' ||
      key === 'extensions:repos' ||
      key === 'app_preferences' ||
      key === 'reader_preferences' ||
      key === 'theme:accentColor' ||
      key.startsWith('chapters:'),
  );
  for (const key of keysToDelete) {
    storage.remove(key);
  }

  // 2. Set restored keys back to MMKV database
  for (const [key, value] of Object.entries(kv)) {
    storage.set(key, value);
  }
}
