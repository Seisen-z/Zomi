import ReactNativeBlobUtil from 'react-native-blob-util';
import { AvailableExtension } from './models';
import { getApkUrl } from './extensionApi';

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = uint8Array.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = uint8Array[i];
    const b2 = i + 1 < len ? uint8Array[i + 1] : 0;
    const b3 = i + 2 < len ? uint8Array[i + 2] : 0;
    const c1 = b1 >> 2;
    const c2 = ((b1 & 3) << 4) | (b2 >> 4);
    const c3 = ((b2 & 15) << 2) | (b3 >> 6);
    const c4 = b3 & 63;
    result += chars.charAt(c1) + chars.charAt(c2) +
      (i + 1 < len ? chars.charAt(c3) : '=') +
      (i + 2 < len ? chars.charAt(c4) : '=');
  }
  return result;
}

export async function downloadAndInstallExtension(
  extension: AvailableExtension,
  onProgress: (percent: number) => void,
): Promise<void> {
  const { fs } = ReactNativeBlobUtil;
  const path = `${fs.dirs.CacheDir}/${extension.pkgName}.apk`;

  onProgress(10);
  const response = await fetch(getApkUrl(extension));
  if (!response.ok) {
    throw new Error(`Failed to download APK: ${response.status} ${response.statusText}`);
  }
  
  onProgress(40);
  const buffer = await response.arrayBuffer();
  
  onProgress(70);
  const uint8 = new Uint8Array(buffer);
  const base64 = uint8ArrayToBase64(uint8);
  
  onProgress(90);
  await fs.writeFile(path, base64, 'base64');
  
  onProgress(100);
  await ReactNativeBlobUtil.android.actionViewIntent(path, 'application/vnd.android.package-archive');
}

export async function isPackageInstalled(packageName: string): Promise<boolean> {
  const { AppManager } = require('react-native').NativeModules;
  if (!AppManager) return false;
  try {
    return await AppManager.isPackageInstalled(packageName);
  } catch (e) {
    console.error('Failed to check package status:', e);
    return false;
  }
}

export async function uninstallPackage(packageName: string): Promise<void> {
  const { AppManager } = require('react-native').NativeModules;
  if (!AppManager) throw new Error('AppManager native module unavailable');
  await AppManager.uninstallPackage(packageName);
}

export async function getInstalledPackages(): Promise<string[]> {
  const { AppManager } = require('react-native').NativeModules;
  if (!AppManager) return [];
  try {
    return await AppManager.getInstalledPackages();
  } catch (e) {
    console.error('Failed to get installed packages:', e);
    return [];
  }
}
