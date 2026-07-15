import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Plus, Star, Trash2, X, Check, Pencil, DownloadCloud } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { Category, isAutoDownloadCategory, withAutoDownloadFlag } from '../data/models';
import { createCategory, deleteCategory, getCategories, getDefaultCategoryId, setDefaultCategoryId, updateCategory } from '../data/repository';

interface CategoryManagerModalProps {
  visible: boolean;
  onClose: () => void;
  onChange: () => void;
}

// Opened from the Library screen's "manage categories" button. Lets the user create, rename,
// and delete categories, and pick which one the manga-detail quick-add (plain tap) uses.
export function CategoryManagerModal({ visible, onClose, onChange }: CategoryManagerModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [defaultId, setDefaultId] = useState<string>('0');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  React.useEffect(() => {
    if (visible) {
      setCategories(getCategories());
      setDefaultId(getDefaultCategoryId());
      setNewName('');
      setEditingId(null);
    }
  }, [visible]);

  const refresh = () => {
    setCategories(getCategories());
    onChange();
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createCategory(name);
    setNewName('');
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteCategory(id);
    if (defaultId === id) {
      setDefaultId('0');
      setDefaultCategoryId('0');
    }
    refresh();
  };

  const startEditing = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const commitEditing = () => {
    if (editingId) {
      const name = editingName.trim();
      if (name) updateCategory({ id: editingId, name });
    }
    setEditingId(null);
    refresh();
  };

  const handleSetDefault = (id: string) => {
    setDefaultId(id);
    setDefaultCategoryId(id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Categories</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Tap the star to set the default quick-add category. Tap the cloud icon to
            auto-download new chapters for manga in that category.
          </Text>

          <ScrollView style={styles.list}>
            {categories.length === 0 && <Text style={styles.emptyText}>No categories yet.</Text>}
            {categories.map((cat) => (
              <View key={cat.id} style={styles.row}>
                <TouchableOpacity onPress={() => handleSetDefault(cat.id)} style={styles.starButton}>
                  <Star size={16} color={defaultId === cat.id ? colors.accent : colors.textFaint} fill={defaultId === cat.id ? colors.accent : 'none'} />
                </TouchableOpacity>
                {editingId === cat.id ? (
                  <TextInput
                    value={editingName}
                    onChangeText={setEditingName}
                    style={styles.editInput}
                    autoFocus
                    onSubmitEditing={commitEditing}
                    onBlur={commitEditing}
                  />
                ) : (
                  <Text style={styles.rowText}>{cat.name}</Text>
                )}
                {editingId === cat.id ? (
                  <TouchableOpacity onPress={commitEditing} style={styles.rowAction}>
                    <Check size={16} color={colors.success} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => startEditing(cat)} style={styles.rowAction}>
                    <Pencil size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => {
                    updateCategory({ id: cat.id, flags: withAutoDownloadFlag(cat, !isAutoDownloadCategory(cat)) });
                    refresh();
                  }}
                  style={styles.rowAction}
                >
                  <DownloadCloud size={15} color={isAutoDownloadCategory(cat) ? colors.accent : colors.textFaint} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(cat.id)} style={styles.rowAction}>
                  <Trash2 size={15} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
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

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, maxHeight: '78%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  closeButton: { padding: 4 },
  hint: { color: colors.textFaint, fontSize: 11, marginTop: 4, marginBottom: 8 },
  list: { flexGrow: 0 },
  emptyText: { color: colors.textFaint, fontSize: 13, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  starButton: { padding: 4 },
  rowText: { color: colors.text, fontSize: 14, flex: 1 },
  editInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: 2,
  },
  rowAction: { padding: 6 },
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
  doneButton: { marginTop: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' },
  doneText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
