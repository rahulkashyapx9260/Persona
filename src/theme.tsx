import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

import {ContactNames, isNativeModuleAvailable} from './native/ContactNames';

/**
 * Two palettes with identical keys, so every component can be written once
 * against `Colors` and simply re-render when the active theme changes.
 */
export type Colors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  accentText: string;
  success: string;
  warning: string;
  danger: string;
  shadow: string;
  /** Colour of the halo cast by cards, buttons and the logo. */
  glow: string;
  /** The two lights that tint the background behind everything. */
  ambientA: string;
  ambientB: string;
};

/**
 * True black, not charcoal. Surfaces are translucent so the faint ambient
 * lights read as a sheen on the cards rather than tinting the page — the
 * background itself stays black.
 */
export const darkColors: Colors = {
  background: '#000000',
  surface: 'rgba(24,24,28,0.86)',
  surfaceAlt: 'rgba(40,40,46,0.86)',
  border: 'rgba(255,255,255,0.13)',
  text: '#f4f5f8',
  textMuted: '#9a9aa6',
  accent: '#4f8cff',
  accentMuted: 'rgba(79,140,255,0.16)',
  accentText: '#ffffff',
  success: '#2fd98f',
  warning: '#ffc24b',
  danger: '#ff6b6b',
  shadow: '#000000',
  glow: 'rgba(79,140,255,0.26)',
  ambientA: 'rgba(96,78,232,0.16)',
  ambientB: 'rgba(32,116,255,0.13)',
};

export const lightColors: Colors = {
  background: '#f5f7fa',
  surface: '#ffffff',
  surfaceAlt: '#eef1f6',
  border: '#dde2ea',
  text: '#111722',
  textMuted: '#5d6775',
  accent: '#2563eb',
  // Tinted fill rather than a dark block, so selected chips stay readable.
  accentMuted: '#dbe6ff',
  accentText: '#ffffff',
  success: '#0f9d63',
  warning: '#b7791f',
  danger: '#d92d20',
  shadow: '#0b1220',
  glow: 'rgba(37,99,235,0.18)',
  ambientA: 'rgba(129,140,248,0.20)',
  ambientB: 'rgba(56,160,255,0.16)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

/** Dark stays the default for anything reading the palette statically. */
export const colors = darkColors;

export type ThemeMode = 'system' | 'light' | 'dark';

const PREF_KEY = 'theme_mode';

type ThemeValue = {
  palette: Colors;
  isDark: boolean;
  /** What the user chose, which may be "follow the system". */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

/** Light unless the user says otherwise. */
const DEFAULT_MODE: ThemeMode = 'light';

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  // The choice lives in the same SQLite store as everything else, so it
  // survives reinstalling nothing and needs no extra dependency.
  useEffect(() => {
    let cancelled = false;
    if (!isNativeModuleAvailable()) {
      return;
    }
    ContactNames.getPreference(PREF_KEY, DEFAULT_MODE)
      .then(value => {
        if (!cancelled && isThemeMode(value)) {
          setModeState(value);
        }
      })
      .catch(() => {
        // A missing preference is not worth surfacing; the default stands.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    if (isNativeModuleAvailable()) {
      ContactNames.setPreference(PREF_KEY, next).catch(() => {});
    }
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark';
    return {
      palette: isDark ? darkColors : lightColors,
      isDark,
      mode,
      setMode,
    };
  }, [mode, systemScheme, setMode]);

  return (
    <ThemeContext.Provider value={value}>
      <ThemeTransition palette={value.palette}>{children}</ThemeTransition>
    </ThemeContext.Provider>
  );
}

/**
 * Softens the switch between palettes.
 *
 * Every themed stylesheet is rebuilt in one pass, so without this the screen
 * snaps from one palette to the other. Here the *outgoing* background is held
 * on top as an opaque sheet and faded out, which reads as the new design
 * emerging rather than a flash. It is purely cosmetic and never swallows
 * touches.
 */
function ThemeTransition({
  palette,
  children,
}: {
  palette: Colors;
  children: React.ReactNode;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const previous = useRef(palette.background);
  const [cover, setCover] = useState(palette.background);

  useEffect(() => {
    if (previous.current === palette.background) {
      return;
    }
    setCover(previous.current);
    previous.current = palette.background;
    fade.setValue(1);
    Animated.timing(fade, {
      toValue: 0,
      duration: 320,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [palette.background, fade]);

  return (
    <View style={flex}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {backgroundColor: cover, opacity: fade},
        ]}
      />
    </View>
  );
}

const flex = {flex: 1} as const;

function isThemeMode(value: string): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return value;
}

export function useColors(): Colors {
  return useTheme().palette;
}

export function useIsDark(): boolean {
  return useTheme().isDark;
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const {mode, setMode} = useTheme();
  return [mode, setMode];
}

/**
 * Builds a stylesheet from the active palette and rebuilds it only when the
 * palette changes, so switching themes costs one `StyleSheet.create`.
 */
export function useThemedStyles<T extends Record<string, unknown>>(
  factory: (palette: Colors) => T,
): T {
  const palette = useColors();
  // StyleSheet.create only narrows types; at runtime it hands back the same
  // shape. The cast keeps each caller's exact style names instead of
  // collapsing them to RN's internal style record.
  return useMemo(
    () => StyleSheet.create(factory(palette) as never) as T,
    [palette, factory],
  );
}
