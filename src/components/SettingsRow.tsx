import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '../theme/useThemeColors';

export interface SettingToggleProps {
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

const TOGGLE_TRACK_WIDTH = 44;
const TOGGLE_THUMB_SIZE = 20;
const TOGGLE_TRAVEL = TOGGLE_TRACK_WIDTH - TOGGLE_THUMB_SIZE - 4;

export function SettingToggle({ label, subtitle, value, onChange }: SettingToggleProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.accent] });
  const thumbTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [2, TOGGLE_TRAVEL + 2] });

  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {subtitle && <Text style={styles.toggleSubtitle}>{subtitle}</Text>}
      </View>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onChange(!value)}>
        <Animated.View style={[styles.switchTrack, { backgroundColor: trackColor }]}>
          <Animated.View style={[styles.switchThumb, { transform: [{ translateX: thumbTranslate }] }]} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

export interface SettingRowProps {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
}

export function SettingRow({ icon, label, value, destructive, onPress }: SettingRowProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.settingRow} {...(onPress ? { onPress } : {})}>
      {icon && <View style={{ opacity: destructive ? 1 : 0.9 }}>{icon}</View>}
      <Text style={[styles.settingLabel, destructive && { color: colors.danger }]}>{label}</Text>
      {value && <Text style={styles.settingValue}>{value}</Text>}
      {onPress && <ChevronRight size={15} color={colors.textDim} />}
    </Wrapper>
  );
}

export function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  section: { marginBottom: 16 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 8 },
  sectionCard: { borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggleLabel: { color: colors.text, fontSize: 14 },
  toggleSubtitle: { color: colors.textFaint, fontSize: 12 },
  switchTrack: { width: TOGGLE_TRACK_WIDTH, height: 24, borderRadius: 999, marginLeft: 12, justifyContent: 'center' },
  switchThumb: { position: 'absolute', width: TOGGLE_THUMB_SIZE, height: TOGGLE_THUMB_SIZE, borderRadius: 999, backgroundColor: '#fff' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  settingLabel: { flex: 1, color: colors.text, fontSize: 14 },
  settingValue: { color: colors.textFaint, fontSize: 13 },
});
