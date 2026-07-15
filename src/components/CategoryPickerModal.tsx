import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Check, Plus, X } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { Category } from '../data/models';

interface CategoryPickerModalProps {
  visible: boolean;
  categories: Category[];
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
  onCreateCategory: (name: string) => Category;
}

// Long-press on the library-add button opens this: pick one or more categories to file the
// manga under, instead of the plain-tap quick-add-to-default behavior.
export function CategoryPickerModal({
  visible,
  categories,
  selectedIds,
  onClose,
  onConfirm,
  onCreateCategory,
}: CategoryPickerModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [newName, setNewName] = useState('');

  React.useEffect(() => {
    if (visible) {
      setSelected(selectedIds);
      setLocalCategories(categories);
      setNewName('');
    }
  }, [visible, selectedIds, categories]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const category = onCreateCategory(name);
    setLocalCategories((prev) => [...prev, category]);
    setSelected((prev) => [...prev, category.id]);
    setNewName('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Set categories</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list}>
            {localCategories.length === 0 && (
              <Text style={styles.emptyText}>No categories yet. Create one below.</Text>
            )}
            {localCategories.map((cat) => {
              const isSelected = selected.includes(cat.id);
              return (
                <TouchableOpacity key={cat.id} style={styles.row} onPress={() => toggle(cat.id)}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                    {isSelected && <Check size={13} color="#fff" />}
                  </View>
                  <Text style={styles.rowText}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.newRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="New category name"
              placeholderTextColor={colors.textFaint}
              style={styles.newInput}
              onSubmitEditing={handleCreate}
            />
            <TouchableOpacity style={styles.newButton} onPress={handleCreate}>
              <Plus size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(selected)}>
              <Text style={styles.confirmText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, maxHeight: '75%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  closeButton: { padding: 4 },
  list: { flexGrow: 0 },
  emptyText: { color: colors.textFaint, fontSize: 13, paddingVertical: 12 },
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
  newRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  newInput: {
    flex: 1,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newButton: { backgroundColor: colors.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  footer: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  confirmButton: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
