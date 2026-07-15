import { getAccentColor } from './themeStore';

// hex must be a plain "#rrggbb" string (no shorthand, no alpha channel).
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildColors(accent: string) {
  return {
    background: '#0f0f13',
    backgroundDeep: '#050507',
    surface: '#1e1e28',
    surfaceAlt: '#16161e',
    surfaceRaised: '#1a1a24',
    border: '#2a2a38',
    accent,
    accentSoft: hexToRgba(accent, 0.15),
    accentBorder: hexToRgba(accent, 0.2),
    text: '#f1f1f1',
    textMuted: '#9ca3af',
    textFaint: '#6b7280',
    textDim: '#4b5563',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#60a5fa',
    purple: '#a855f7',
  } as const;
}

// Static fallback for any call site that hasn't switched to useThemeColors() yet — seeded from
// whatever accent was last persisted, so at minimum a cold start reflects the user's choice
// even before their first re-render. Prefer useThemeColors() in components: this won't update
// live when the user picks a new Theme Color.
export const colors = buildColors(getAccentColor());
