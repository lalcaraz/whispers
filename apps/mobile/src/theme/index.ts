/**
 * Theme palettes and resolution. Pure — no React Native imports — so it can be
 * unit-tested under plain Node (see test/theme.test.mts). The React glue lives
 * in `src/hooks/useTheme.tsx`; every `StyleSheet` factory in the app
 * (a `makeStyles` in each `styles.ts`) reads exclusively from `ThemeColors`.
 *
 * `light` keeps the app's original hardcoded colors. `dark` is an
 * iOS-system-style dark scheme.
 */

export type ThemeColors = {
  /** App screen background (below cards). */
  screen: string;
  /** Card / raised surface. */
  surface: string;
  /** Inset field background inside a card. */
  surfaceAlt: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  border: string;
  borderStrong: string;

  /** Primary action / selection color. */
  accent: string;
  /** Text/icon on top of `accent`. */
  onAccent: string;

  danger: string;
  /** `danger` at rest when the control is disabled. */
  dangerDisabled: string;
  onDanger: string;

  warningBg: string;
  warningBorder: string;
  warningText: string;

  /** Scrim behind a modal / prompt. */
  overlay: string;
  /** Heavier scrim (emergency countdown). */
  overlayStrong: string;

  bubbleIncoming: string;
  bubbleOutgoing: string;
  onBubbleIncoming: string;
  onBubbleOutgoing: string;
  onBubbleIncomingMuted: string;
  onBubbleOutgoingMuted: string;

  shadow: string;

  /** QR code stays black-on-white in every theme for scanner reliability. */
  qrBackground: string;
  qrForeground: string;
};

export const light: ThemeColors = {
  screen: '#f5f5f5',
  surface: '#ffffff',
  surfaceAlt: '#f9f9f9',

  textPrimary: '#333333',
  textSecondary: '#666666',
  textMuted: '#999999',

  border: '#e0e0e0',
  borderStrong: '#cccccc',

  accent: '#007aff',
  onAccent: '#ffffff',

  danger: '#ff3b30',
  dangerDisabled: '#ffb3ae',
  onDanger: '#ffffff',

  warningBg: '#fff3cd',
  warningBorder: '#ffc107',
  warningText: '#856404',

  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayStrong: 'rgba(0, 0, 0, 0.9)',

  bubbleIncoming: '#e9e9eb',
  bubbleOutgoing: '#007aff',
  onBubbleIncoming: '#000000',
  onBubbleOutgoing: '#ffffff',
  onBubbleIncomingMuted: '#666666',
  onBubbleOutgoingMuted: 'rgba(255, 255, 255, 0.7)',

  shadow: '#000000',

  qrBackground: '#ffffff',
  qrForeground: '#000000',
};

export const dark: ThemeColors = {
  screen: '#000000',
  surface: '#1c1c1e',
  surfaceAlt: '#2c2c2e',

  textPrimary: '#f2f2f7',
  textSecondary: '#aeaeb2',
  textMuted: '#8e8e93',

  border: '#38383a',
  borderStrong: '#48484a',

  accent: '#0a84ff',
  onAccent: '#ffffff',

  danger: '#ff453a',
  dangerDisabled: '#5c2b28',
  onDanger: '#ffffff',

  warningBg: '#3a3320',
  warningBorder: '#8a6d1a',
  warningText: '#e8c766',

  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayStrong: 'rgba(0, 0, 0, 0.92)',

  bubbleIncoming: '#2c2c2e',
  bubbleOutgoing: '#0a84ff',
  onBubbleIncoming: '#f2f2f7',
  onBubbleOutgoing: '#ffffff',
  onBubbleIncomingMuted: '#8e8e93',
  onBubbleOutgoingMuted: 'rgba(255, 255, 255, 0.7)',

  shadow: '#000000',

  qrBackground: '#ffffff',
  qrForeground: '#000000',
};

/** What the user chose in Profile. `'system'` follows the OS setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Collapse the user preference plus the OS color scheme into the concrete
 * scheme to render. `systemScheme` is React Native's `useColorScheme()` return
 * (`null` when the OS gives no answer — treated as light).
 */
export function resolveScheme(
  pref: ThemePreference,
  systemScheme: string | null | undefined,
): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
