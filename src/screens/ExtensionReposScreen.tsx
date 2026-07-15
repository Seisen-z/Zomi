import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, StyleSheet } from 'react-native';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';
import { addExtensionRepo, CreateExtensionRepoResult, removeExtensionRepo } from '../data/repository';

interface ExtensionReposScreenProps {
  repos: string[];
  onReposChange: (repos: string[]) => void;
  onBack: () => void;
}

function AddRepoDialog({ repos, onClose, onAdded }: { repos: string[]; onClose: () => void; onAdded: (url: string) => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<CreateExtensionRepoResult | null>(null);

  const alreadyExists = repos.includes(url.replace(/\/index\.min\.json$/, ''));
  const canSubmit = url.length > 0 && !alreadyExists;

  const handleAdd = () => {
    const outcome = addExtensionRepo(url);
    setResult(outcome);
    if (outcome === 'success') onAdded(url);
  };

  const helperText =
    alreadyExists ? 'This repo has already been added'
    : result === 'invalid-url' ? "Must be a URL ending with 'index.min.json'"
    : '*required';
  const isError = alreadyExists || result === 'invalid-url';

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Add repo</Text>
          <Text style={styles.dialogMessage}>
            Add additional repos to Zomi. This should be a URL that ends with "index.min.json".
          </Text>
          <Text style={styles.fieldLabel}>Repo URL</Text>
          <TextInput
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setResult(null);
            }}
            placeholder="https://example.com/index.min.json"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, isError && styles.inputError]}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.helperText, isError && styles.helperTextError]}>{helperText}</Text>
          <View style={styles.dialogActions}>
            <TouchableOpacity onPress={onClose} style={styles.dialogButton}>
              <Text style={styles.dialogButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAdd} disabled={!canSubmit} style={styles.dialogButton}>
              <Text style={[styles.dialogButtonText, styles.dialogButtonPrimary, !canSubmit && styles.dialogButtonDisabled]}>
                Add
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ExtensionReposScreen({ repos, onReposChange, onBack }: ExtensionReposScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleDelete = (repo: string) => {
    removeExtensionRepo(repo);
    onReposChange(repos.filter((r) => r !== repo));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Extension repos</Text>
      </View>

      {repos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>(・Д・｡ヽ</Text>
          <Text style={styles.emptyText}>You have no repos set.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {repos.map((repo) => (
            <View key={repo} style={styles.repoRow}>
              <Text style={styles.repoUrl} numberOfLines={1}>
                {repo}
              </Text>
              <TouchableOpacity onPress={() => handleDelete(repo)} style={styles.deleteButton}>
                <Trash2 size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowAddDialog(true)}>
        <Plus size={18} color="#fff" />
        <Text style={styles.fabText}>Add</Text>
      </TouchableOpacity>

      {showAddDialog && (
        <AddRepoDialog
          repos={repos}
          onClose={() => setShowAddDialog(false)}
          onAdded={(url) => {
            const baseUrl = url.replace(/\/index\.min\.json$/, '');
            onReposChange([...repos, baseUrl]);
            setShowAddDialog(false);
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  backButton: { padding: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyEmoji: { color: colors.textMuted, fontSize: 24 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  list: { padding: 16, gap: 8 },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  repoUrl: { flex: 1, color: colors.text, fontSize: 13 },
  deleteButton: { padding: 6 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400, borderRadius: 16, backgroundColor: colors.surfaceRaised, padding: 20, borderWidth: 1, borderColor: colors.border },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  dialogMessage: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  fieldLabel: { color: colors.accent, fontSize: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 },
  inputError: { borderColor: colors.danger },
  helperText: { color: colors.textFaint, fontSize: 11, marginTop: 6 },
  helperTextError: { color: colors.danger },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 20 },
  dialogButton: { paddingVertical: 6 },
  dialogButtonText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  dialogButtonPrimary: { color: colors.accent },
  dialogButtonDisabled: { color: colors.textDim },
});
