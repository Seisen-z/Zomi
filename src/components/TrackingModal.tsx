import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { X, Search } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { TrackerId, TrackLink, getTrackLinks, setTrackLink, removeTrackLink } from '../data/trackers/trackLinks';
import { TRACKERS, TrackerSearchResult } from '../data/trackers/registry';

interface TrackingModalProps {
  visible: boolean;
  mangaId: string;
  mangaTitle: string;
  onClose: () => void;
}

// Real Tachiyomi's per-manga "tracking" sheet: link this manga to a matching entry on each
// logged-in tracker so chapter-read progress gets pushed there automatically.
export function TrackingModal({ visible, mangaId, mangaTitle, onClose }: TrackingModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [links, setLinks] = useState<TrackLink[]>(() => getTrackLinks(mangaId));
  const [activeTracker, setActiveTracker] = useState<TrackerId | null>(null);
  const [query, setQuery] = useState(mangaTitle);
  const [results, setResults] = useState<TrackerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (visible) {
      setLinks(getTrackLinks(mangaId));
      setActiveTracker(null);
    }
  }, [visible, mangaId]);

  const activeDef = TRACKERS.find((t) => t.id === activeTracker);

  const openSearch = (tracker: TrackerId) => {
    setActiveTracker(tracker);
    setQuery(mangaTitle);
    setResults([]);
    handleSearch(tracker, mangaTitle);
  };

  const handleSearch = async (tracker: TrackerId, q: string) => {
    if (!q.trim()) return;
    const def = TRACKERS.find((t) => t.id === tracker);
    if (!def) return;
    setSearching(true);
    try {
      setResults(await def.search(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handlePick = (tracker: TrackerId, result: TrackerSearchResult) => {
    setTrackLink(mangaId, { tracker, remoteId: result.id, title: result.title });
    setLinks(getTrackLinks(mangaId));
    setActiveTracker(null);
  };

  const handleUnlink = (tracker: TrackerId, name: string) => {
    Alert.alert(`Stop tracking on ${name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeTrackLink(mangaId, tracker);
          setLinks(getTrackLinks(mangaId));
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {activeDef ? (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Search {activeDef.name}</Text>
                <TouchableOpacity onPress={() => setActiveTracker(null)}>
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search title"
                  placeholderTextColor={colors.textDim}
                  onSubmitEditing={() => handleSearch(activeDef.id, query)}
                />
                <TouchableOpacity style={styles.searchButton} onPress={() => handleSearch(activeDef.id, query)}>
                  <Search size={16} color={colors.accent} />
                </TouchableOpacity>
              </View>
              {searching ? (
                <ActivityIndicator style={{ marginTop: 20 }} color={colors.accent} />
              ) : (
                <ScrollView style={{ maxHeight: 320 }}>
                  {results.map((r) => (
                    <TouchableOpacity key={r.id} style={styles.resultRow} onPress={() => handlePick(activeDef.id, r)}>
                      <Text style={styles.resultText}>{r.title}</Text>
                    </TouchableOpacity>
                  ))}
                  {results.length === 0 && <Text style={styles.emptyText}>No results</Text>}
                </ScrollView>
              )}
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Tracking</Text>
                <TouchableOpacity onPress={onClose}>
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {TRACKERS.map((t) => {
                const link = links.find((l) => l.tracker === t.id);
                const loggedIn = t.isLoggedIn();
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.trackerRow}
                    disabled={!loggedIn}
                    onPress={() => (link ? handleUnlink(t.id, t.name) : openSearch(t.id))}
                  >
                    <Text style={[styles.trackerName, !loggedIn && { opacity: 0.4 }]}>{t.name}</Text>
                    <Text style={styles.trackerValue}>
                      {!loggedIn ? 'Log in from More > Trackers' : link ? link.title : 'Not tracked'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  trackerRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trackerName: { color: colors.text, fontSize: 14, fontWeight: '500' },
  trackerValue: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
  },
  searchButton: { padding: 10, justifyContent: 'center' },
  resultRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultText: { color: colors.text, fontSize: 14 },
  emptyText: { color: colors.textFaint, fontSize: 13, textAlign: 'center', marginTop: 20 },
});
