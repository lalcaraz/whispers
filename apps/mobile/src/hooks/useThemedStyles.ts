import { useMemo } from 'react';
import useTheme from '@hooks/useTheme';
import type { ThemeColors } from '@/theme';

/**
 * Build a StyleSheet from the active theme colors, rebuilt only when the theme
 * changes. Pass a module-level factory so its identity is stable:
 *
 *   // foo/styles.ts
 *   export const makeStyles = (c: ThemeColors) => StyleSheet.create({ ... });
 *
 *   // foo/index.tsx
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}
