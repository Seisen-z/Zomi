import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';

export type ChapterFilter = 'all' | 'unread' | 'read' | 'bookmarked' | 'downloaded';

const OPTIONS: { label: string; value: ChapterFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Read', value: 'read' },
  { label: 'Bookmarked', value: 'bookmarked' },
  { label: 'Downloaded', value: 'downloaded' },
];

interface ChapterFilterModalProps {
  visible: boolean;
  value: ChapterFilter;
  onClose: () => void;
  onSelect: (value: ChapterFilter) => void;
}

// Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/chapter/ChapterFilterDialog.kt.
// Native Alert.alert on Android silently drops any button past the third, so a real 5-option
// picker needs its own sheet rather than reusing the Alert-based menus elsewhere on this screen.
export function ChapterFilterModal({ visible, value, onClose, onSelect }: ChapterFilterModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>Filter chapters</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {OPTIONS.map((o) => {
            const isSelected = value === o.value;
            return (
              <TouchableOpacity
                key={o.value}
                style={styles.row}
                onPress={() => {
                  onSelect(o.value);
                  onClose();
                }}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                  {isSelected && <Check size={13} color="#fff" />}
                </View>
                <Text style={styles.rowText}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: 16, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  closeButton: { padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rowText: { color: colors.text, fontSize: 14 },
});
