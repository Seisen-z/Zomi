import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Alert, Linking, Image } from 'react-native';
import {
  Palette,
  Tags,
  RefreshCw,
  Globe,
  BookOpen,
  Clock,
  Eye,
  HardDrive,
  Database,
  Shield,
  RotateCcw,
  Info,
  Smartphone,
  User,
  Cloud,
  CloudUpload,
  CloudDownload,
} from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { getAccentColor, setAccentColor } from '../theme/themeStore';
import { getAppPreferences, setAppPreferences, AppPreferences, PageTurnSpeed } from '../data/appPreferences';
import { getReaderPreferences, setReaderPreferences, ReadingMode, BackgroundMode } from '../data/readerPreferences';
import { hasPin, setPin } from '../data/appLock';
import { clearAllReadingHistory, getExtensionRepos } from '../data/repository';
import { clearReaderCache, getReaderCacheSizeBytes, formatBytes } from '../data/cache';
import { removeKey } from '../data/storage';
import { SettingRow, SettingToggle, SectionCard } from '../components/SettingsRow';
import { ActionSheetModal, ActionSheetOption } from '../components/ActionSheetModal';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { LockScreen } from '../components/LockScreen';
import { ExtensionReposScreen } from './ExtensionReposScreen';
// Tracker imports removed
import {
  getGoogleSession,
  clearGoogleSession,
  subscribeGoogleSession,
  googleAuthUrl,
} from '../data/googleAuth';

const THEME_COLORS: { label: string; hex: string }[] = [
  { label: 'Orange', hex: '#e85d04' },
  { label: 'Green', hex: '#22c55e' },
  { label: 'Blue', hex: '#3b82f6' },
  { label: 'Purple', hex: '#a855f7' },
  { label: 'Red', hex: '#ef4444' },
];

const UPDATE_INTERVALS = [1, 6, 12, 24, 48];
const LANGUAGES = ['English', 'Spanish', 'Japanese', 'Korean'];

// Enhanced trackers removed

const READING_MODE_LABELS: Record<ReadingMode, string> = {
  default: 'Default',
  ltr: 'Left to Right',
  rtl: 'Right to Left',
  vertical: 'Vertical',
  webtoon: 'Long Strip',
  'continuous-vertical': 'Continuous Vertical',
};

const BG_MODE_LABELS: Record<BackgroundMode, string> = {
  white: 'White',
  sepia: 'Sepia',
  dark: 'Dark',
};

const PAGE_TURN_SPEED_LABELS: Record<PageTurnSpeed, string> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
};

// TrackerLogo helper removed

type Picker =
  | 'themeColor'
  | 'updateInterval'
  | 'libraryLanguage'
  | 'readingMode'
  | 'bgMode'
  | 'pageTurnSpeed'
  | null;

export function MoreScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [prefs, setPrefs] = useState<AppPreferences>(() => getAppPreferences());
  const [readerPrefs, setReaderPrefsState] = useState(() => getReaderPreferences());
  const [accent, setAccent] = useState(() => getAccentColor());
  const [picker, setPicker] = useState<Picker>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [showRepos, setShowRepos] = useState(false);
  const [repos, setRepos] = useState<string[]>(() => getExtensionRepos());
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  // Tracker states removed
  const [googleSession, setGoogleSession] = useState(() => getGoogleSession());
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getReaderCacheSizeBytes().then(setCacheSize);
  }, []);

  useEffect(() => {
    return subscribeGoogleSession(() => {
      setGoogleSession(getGoogleSession());
    });
  }, []);

  // Tracker logic removed

  const [checkingUpdates, setCheckingUpdates] = useState(false);

  const handleCheckForUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const response = await fetch('https://api.github.com/repos/Seisen-z/Zomi/releases/latest');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data = await response.json();
      const latestTag = data.tag_name;
      const currentVersion = '1.0.1';

      const isNewer = (curr: string, late: string) => {
        const cleanC = curr.replace(/^v/, '');
        const cleanL = late.replace(/^v/, '');
        const cParts = cleanC.split('.').map(Number);
        const lParts = cleanL.split('.').map(Number);
        for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
          const c = cParts[i] ?? 0;
          const l = lParts[i] ?? 0;
          if (l > c) return true;
          if (c > l) return false;
        }
        return false;
      };

      if (isNewer(currentVersion, latestTag)) {
        Alert.alert(
          'Update Available',
          `A new version (${latestTag}) is available. Would you like to view the release page?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Release', onPress: () => Linking.openURL(data.html_url) },
          ]
        );
      } else {
        Alert.alert('Up to date', `You are on the latest version (${currentVersion}).`);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Check Failed', 'Could not fetch updates from GitHub. Please try again.');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const update = (patch: Partial<AppPreferences>) => {
    setAppPreferences(patch);
    setPrefs(getAppPreferences());
  };

  const updateReaderPrefs = (patch: Partial<typeof readerPrefs>) => {
    setReaderPreferences(patch);
    setReaderPrefsState(getReaderPreferences());
  };

  const handleToggleAppLock = (enable: boolean) => {
    if (enable && !hasPin()) {
      setShowSetPin(true);
      return;
    }
    update({ appLockEnabled: enable });
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear cache?',
      `This frees up ${cacheSize != null ? formatBytes(cacheSize) : 'cached'} of temporary reader page images. Downloaded chapters are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearReaderCache();
            setCacheSize(0);
          },
        },
      ],
    );
  };

  const handleClearReadingHistory = () => {
    Alert.alert(
      'Clear reading history?',
      'This resets read/progress state for every manga in your library. Downloads are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearAllReadingHistory },
      ],
    );
  };

  const handleResetSettings = () => {
    Alert.alert(
      'Reset all settings?',
      'This resets Appearance, Reader, Library, Downloads, and Security settings back to their defaults. Your library, downloads, and reading history are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            removeKey('app_preferences');
            removeKey('reader_preferences');
            removeKey('theme:accentColor');
            Alert.alert('Done', 'Restart the app for every screen to pick up the defaults.');
          },
        },
      ],
    );
  };

  const handleGooglePress = () => {
    if (googleSession) {
      Alert.alert(
        'Google Account',
        `Signed in as ${googleSession.email}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: clearGoogleSession },
        ]
      );
    } else {
      Linking.openURL(googleAuthUrl());
    }
  };

  const handleBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const { uploadBackup } = require('../data/googleDriveBackup');
      await uploadBackup();
      Alert.alert('Success', 'Library backed up to Google Drive successfully!');
    } catch (err: any) {
      Alert.alert('Backup failed', err.message || String(err));
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = () => {
    Alert.alert(
      'Restore backup?',
      'This will clear your current library, categories, and settings, and replace them with the backup from Google Drive. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const { downloadAndRestoreBackup } = require('../data/googleDriveBackup');
              await downloadAndRestoreBackup();
              Alert.alert(
                'Restore complete',
                'Your library has been restored. Please restart the app for all screens to pick up the restored data.',
                [{ text: 'OK' }]
              );
            } catch (err: any) {
              Alert.alert('Restore failed', err.message || String(err));
            } finally {
              setRestoring(false);
            }
          }
        }
      ]
    );
  };

  if (showRepos) {
    return <ExtensionReposScreen repos={repos} onReposChange={setRepos} onBack={() => setShowRepos(false)} />;
  }

  const themeColorOptions: ActionSheetOption[] = THEME_COLORS.map((c) => ({
    label: c.hex === accent ? `${c.label} (current)` : c.label,
    onPress: () => {
      setAccentColor(c.hex);
      setAccent(c.hex);
    },
  }));

  const intervalOptions: ActionSheetOption[] = UPDATE_INTERVALS.map((hours) => ({
    label: `${hours} hour${hours === 1 ? '' : 's'}`,
    onPress: () => update({ updateIntervalHours: hours }),
  }));

  const languageOptions: ActionSheetOption[] = LANGUAGES.map((lang) => ({
    label: lang,
    onPress: () => update({ libraryLanguage: lang }),
  }));

  const readingModeOptions: ActionSheetOption[] = (Object.keys(READING_MODE_LABELS) as ReadingMode[]).map((mode) => ({
    label: READING_MODE_LABELS[mode],
    onPress: () => updateReaderPrefs({ readingMode: mode }),
  }));

  const bgModeOptions: ActionSheetOption[] = (Object.keys(BG_MODE_LABELS) as BackgroundMode[]).map((mode) => ({
    label: BG_MODE_LABELS[mode],
    onPress: () => updateReaderPrefs({ bgMode: mode }),
  }));

  const pageTurnSpeedOptions: ActionSheetOption[] = (Object.keys(PAGE_TURN_SPEED_LABELS) as PageTurnSpeed[]).map((speed) => ({
    label: PAGE_TURN_SPEED_LABELS[speed],
    onPress: () => update({ pageTurnSpeed: speed }),
  }));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 96 }}>
        <View style={styles.profileCard}>
          {googleSession?.picture ? (
            <Image source={{ uri: googleSession.picture }} style={{ width: 48, height: 48, borderRadius: 999 }} />
          ) : (
            <View style={styles.avatar}>
              <User size={22} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{googleSession ? googleSession.name : 'Guest User'}</Text>
            <Text style={styles.profileSubtitle}>
              {googleSession ? googleSession.email : 'Sign in with Google to back up your library'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.signInButton, googleSession && { backgroundColor: colors.danger }]}
            onPress={googleSession ? () => {
              Alert.alert('Sign Out', 'Sign out of Google?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: clearGoogleSession },
              ]);
            } : () => Linking.openURL(googleAuthUrl())}
          >
            <Text style={styles.signInText}>{googleSession ? 'Sign Out' : 'Sign In'}</Text>
          </TouchableOpacity>
        </View>

        <SectionCard label="APPEARANCE">
          <SettingRow
            icon={<Palette size={16} color={colors.textMuted} />}
            label="Theme Color"
            value={THEME_COLORS.find((c) => c.hex === accent)?.label ?? accent}
            onPress={() => setPicker('themeColor')}
          />
        </SectionCard>

        <SectionCard label="LIBRARY">
          <SettingRow icon={<Tags size={16} color={colors.textMuted} />} label="Edit categories" onPress={() => setShowCategories(true)} />
          <SettingToggle
            label="Auto-update Library"
            subtitle="Check for new chapters"
            value={prefs.autoUpdateLibrary}
            onChange={(v) => update({ autoUpdateLibrary: v })}
          />
          <SettingRow
            icon={<RefreshCw size={16} color={colors.textMuted} />}
            label="Update Interval"
            value={`${prefs.updateIntervalHours} hours`}
            onPress={() => setPicker('updateInterval')}
          />
          <SettingRow
            icon={<Globe size={16} color={colors.textMuted} />}
            label="Library Language"
            value={prefs.libraryLanguage}
            onPress={() => setPicker('libraryLanguage')}
          />
        </SectionCard>

        <SectionCard label="READER">
          <SettingRow
            icon={<BookOpen size={16} color={colors.textMuted} />}
            label="Default Reading Mode"
            value={READING_MODE_LABELS[readerPrefs.readingMode]}
            onPress={() => setPicker('readingMode')}
          />
          <SettingRow
            icon={<Clock size={16} color={colors.textMuted} />}
            label="Page Turn Speed"
            value={PAGE_TURN_SPEED_LABELS[prefs.pageTurnSpeed]}
            onPress={() => setPicker('pageTurnSpeed')}
          />
          <SettingRow
            icon={<Eye size={16} color={colors.textMuted} />}
            label="Background Color"
            value={BG_MODE_LABELS[readerPrefs.bgMode]}
            onPress={() => setPicker('bgMode')}
          />
          <SettingToggle
            label="Keep Screen On"
            subtitle="Prevent screen from sleeping while reading"
            value={readerPrefs.keepScreenOn}
            onChange={(v) => updateReaderPrefs({ keepScreenOn: v })}
          />
          <SettingToggle
            label="Show Page Number"
            value={readerPrefs.showPageNumber}
            onChange={(v) => updateReaderPrefs({ showPageNumber: v })}
          />
          <SettingToggle
            label="Haptic Feedback"
            subtitle="Vibrate on page turns"
            value={prefs.hapticFeedback}
            onChange={(v) => update({ hapticFeedback: v })}
          />
        </SectionCard>

        <SectionCard label="DOWNLOADS">
          <SettingToggle
            label="Wi-Fi Only"
            subtitle="Pause downloads until back on Wi-Fi"
            value={prefs.wifiOnly}
            onChange={(v) => update({ wifiOnly: v })}
          />
          <SettingToggle
            label="Data Saver"
            subtitle="Not yet supported by these sources — saved for now"
            value={prefs.dataSaver}
            onChange={(v) => update({ dataSaver: v })}
          />
          <SettingRow
            icon={<HardDrive size={16} color={colors.textMuted} />}
            label="Download Location"
            value="Internal"
            onPress={() => Alert.alert('Download Location', 'Only internal app storage is supported right now.')}
          />
        </SectionCard>

        // Trackers settings sections removed

        <SectionCard label="BROWSE">
          <SettingRow
            icon={<Globe size={16} color={colors.textMuted} />}
            label="Extension Repos"
            value={`${repos.length}`}
            onPress={() => setShowRepos(true)}
          />
        </SectionCard>

        <SectionCard label="BACKUP AND RESTORE">
          <SettingRow
            icon={<Cloud size={16} color={colors.textMuted} />}
            label="Google Drive Backup"
            value={googleSession ? googleSession.email : 'Not signed in'}
            onPress={handleGooglePress}
          />
          {googleSession && (
            <>
              <SettingRow
                icon={<CloudUpload size={16} color={colors.textMuted} />}
                label={backingUp ? 'Backing up...' : 'Backup to Google Drive'}
                onPress={handleBackup}
              />
              <SettingRow
                icon={<CloudDownload size={16} color={colors.textMuted} />}
                label={restoring ? 'Restoring...' : 'Restore from Google Drive'}
                onPress={handleRestore}
              />
            </>
          )}
        </SectionCard>

        <SectionCard label="DATA AND STORAGE">
          <SettingRow
            icon={<Database size={16} color={colors.textMuted} />}
            label="Clear Cache"
            value={cacheSize != null ? formatBytes(cacheSize) : '…'}
            onPress={handleClearCache}
          />
          <SettingRow
            icon={<Shield size={16} color={colors.textMuted} />}
            label="Clear Reading History"
            destructive
            onPress={handleClearReadingHistory}
          />
        </SectionCard>

        <SectionCard label="SECURITY AND PRIVACY">
          <SettingToggle
            label="App Lock"
            subtitle="Require a PIN when opening the app"
            value={prefs.appLockEnabled}
            onChange={handleToggleAppLock}
          />
          <SettingToggle
            label="Incognito Mode"
            subtitle="Don't save reading history"
            value={prefs.incognitoMode}
            onChange={(v) => update({ incognitoMode: v })}
          />
        </SectionCard>

        <SectionCard label="ADVANCED">
          <SettingRow
            icon={<RotateCcw size={16} color={colors.danger} />}
            label="Reset All Settings"
            destructive
            onPress={handleResetSettings}
          />
        </SectionCard>

        <SectionCard label="ABOUT">
          <SettingRow icon={<Info size={16} color={colors.textMuted} />} label="Version" value="1.0.1" />
          <SettingRow
            icon={<Smartphone size={16} color={colors.textMuted} />}
            label={checkingUpdates ? 'Checking for updates…' : 'Check for Updates'}
            onPress={handleCheckForUpdates}
          />
        </SectionCard>
      </ScrollView>

      <ActionSheetModal visible={picker === 'themeColor'} title="Theme Color" options={themeColorOptions} onClose={() => setPicker(null)} />
      <ActionSheetModal visible={picker === 'updateInterval'} title="Update Interval" options={intervalOptions} onClose={() => setPicker(null)} />
      <ActionSheetModal visible={picker === 'libraryLanguage'} title="Library Language" options={languageOptions} onClose={() => setPicker(null)} />
      <ActionSheetModal visible={picker === 'readingMode'} title="Default Reading Mode" options={readingModeOptions} onClose={() => setPicker(null)} />
      <ActionSheetModal visible={picker === 'bgMode'} title="Background Color" options={bgModeOptions} onClose={() => setPicker(null)} />
      <ActionSheetModal visible={picker === 'pageTurnSpeed'} title="Page Turn Speed" options={pageTurnSpeedOptions} onClose={() => setPicker(null)} />
      <CategoryManagerModal visible={showCategories} onClose={() => setShowCategories(false)} onChange={() => {}} />

      // TrackerLoginModal removed

      <Modal visible={showSetPin} animationType="slide" onRequestClose={() => setShowSetPin(false)}>
        <LockScreen
          mode="create"
          onCancel={() => setShowSetPin(false)}
          onSubmit={(newPin) => {
            setPin(newPin);
            update({ appLockEnabled: true });
            setShowSetPin(false);
          }}
        />
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 16 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#191930',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  avatar: { width: 48, height: 48, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  profileName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  profileSubtitle: { color: colors.textFaint, fontSize: 12 },
  signInButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.accent },
  signInText: { color: '#fff', fontSize: 13 },
  note: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginBottom: 8 },
});
