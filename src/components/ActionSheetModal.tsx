import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionSheetModalProps {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}

// Native Alert.alert on Android silently drops any button past the third, so any menu with
// more than 2 real options (overflow menu, download-range menu) needs its own sheet like this
// instead — see ChapterFilterModal, which hit the same limit first.
export function ActionSheetModal({ visible, title, options, onClose }: ActionSheetModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {options.map((o, i) => (
            <TouchableOpacity
              key={i}
              style={styles.row}
              onPress={() => {
                onClose();
                o.onPress();
              }}
            >
              <Text style={[styles.rowText, o.destructive && styles.destructiveText]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 8 },
  title: { color: colors.textMuted, fontSize: 12, fontWeight: '600', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  row: { paddingHorizontal: 16, paddingVertical: 14 },
  rowText: { color: colors.text, fontSize: 14 },
  destructiveText: { color: colors.danger },
});
