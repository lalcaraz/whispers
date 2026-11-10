import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

export const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.surface,
    },
  });
