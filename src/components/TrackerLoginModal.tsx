import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';

interface TrackerLoginModalProps {
  visible: boolean;
  trackerName: string;
  usernameLabel?: string;
  onCancel: () => void;
  onSubmit: (username: string, password: string) => Promise<void>;
}

// Matches real Tachiyomi's Kitsu/MangaUpdates login dialog: username(or email) + password with a
// show/hide toggle, used for trackers that authenticate directly instead of via browser OAuth.
export function TrackerLoginModal({ visible, trackerName, usernameLabel, onCancel, onSubmit }: TrackerLoginModalProps) {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setLoading(false);
    setError(null);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleSubmit = async () => {
    if (!username || !password) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(username, password);
      reset();
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Login to {trackerName}</Text>
          <TextInput
            style={styles.input}
            placeholder={usernameLabel ?? 'Username'}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Password"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
              {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
            </TouchableOpacity>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={handleCancel} disabled={loading}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading || !username || !password}>
              {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={[styles.buttonText, { color: colors.accent }]}>Login</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: 16, padding: 20 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    marginBottom: 12,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeButton: { padding: 8, marginBottom: 12 },
  error: { color: colors.danger, fontSize: 12, marginTop: -4, marginBottom: 8 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 8 },
  button: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 56, alignItems: 'center' },
  buttonText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
