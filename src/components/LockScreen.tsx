import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Delete } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';

const PIN_LENGTH = 4;

interface LockScreenProps {
  // 'create' asks for the PIN twice (used the first time App Lock is turned on).
  // 'unlock' verifies against the stored PIN.
  mode: 'create' | 'unlock';
  onSubmit: (pin: string) => boolean | void;
  onCancel?: () => void;
}

// Shown full-screen: on cold start (RootNavigator, when App Lock is on) to unlock, or from the
// More screen when first turning App Lock on, to set the PIN.
export function LockScreen({ mode, onSubmit, onCancel }: LockScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const title =
    mode === 'unlock' ? 'Enter PIN' : firstPin === null ? 'Set a PIN' : 'Confirm PIN';

  const handleDigit = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setError(false);
    if (next.length < PIN_LENGTH) {
      setPin(next);
      return;
    }
    // Full 4 digits entered
    if (mode === 'unlock') {
      const ok = onSubmit(next);
      if (ok === false) {
        setError(true);
        setPin('');
      } else {
        setPin('');
      }
      return;
    }
    // create mode
    if (firstPin === null) {
      setFirstPin(next);
      setPin('');
    } else if (next === firstPin) {
      onSubmit(next);
      setPin('');
      setFirstPin(null);
    } else {
      setError(true);
      setPin('');
      setFirstPin(null);
    }
  };

  const handleBackspace = () => setPin((p) => p.slice(0, -1));

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      {error && <Text style={styles.error}>PINs didn't match — try again</Text>}
      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((key, i) =>
          key === '' ? (
            <View key={i} style={styles.key} />
          ) : key === 'back' ? (
            <TouchableOpacity key={i} style={styles.key} onPress={handleBackspace}>
              <Delete size={20} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity key={i} style={styles.key} onPress={() => handleDigit(key)}>
              <Text style={styles.keyText}>{key}</Text>
            </TouchableOpacity>
          ),
        )}
      </View>
      {onCancel && (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 24 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginTop: -12 },
  dots: { flexDirection: 'row', gap: 16 },
  dot: { width: 14, height: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  dotFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'center' },
  key: { width: 260 / 3, height: 64, alignItems: 'center', justifyContent: 'center' },
  keyText: { color: colors.text, fontSize: 22, fontWeight: '500' },
  cancelButton: { marginTop: 8, padding: 12 },
  cancelText: { color: colors.textMuted, fontSize: 14 },
});
