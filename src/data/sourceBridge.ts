import { NativeModules } from 'react-native';

const { SourceBridge } = NativeModules;

export interface SourceInfo {
  pkgName: string;
  name: string;
  lang: string;
  baseUrl: string;
  supportsLatest: boolean;
}

export async function getSourceInfo(pkgName: string): Promise<SourceInfo> {
  const json: string = await SourceBridge.getSourceInfo(pkgName);
  return JSON.parse(json) as SourceInfo;
}
