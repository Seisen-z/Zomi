import { useEffect, useMemo, useState } from 'react';
import { buildColors } from './colors';
import { getAccentColor, subscribeToTheme } from './themeStore';

// Live version of the static `colors` export — subscribes to Theme Color changes so every screen
// using this hook re-renders with the new accent immediately, instead of only on next cold start.
export function useThemeColors() {
  const [accent, setAccent] = useState(getAccentColor());
  useEffect(() => subscribeToTheme(() => setAccent(getAccentColor())), []);
  return useMemo(() => buildColors(accent), [accent]);
}
