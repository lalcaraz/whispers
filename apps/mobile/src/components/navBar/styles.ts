import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

export const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    leftSection: {
      flex: 1,
      alignItems: 'flex-start',
    },
    centerSection: {
      flex: 2,
      alignItems: 'center',
    },
    rightSection: {
      flex: 1,
      alignItems: 'flex-end',
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: c.textPrimary,
    },
    button: {
      padding: 8,
    },
    buttonText: {
      fontSize: 20,
      color: c.accent,
    },
  });
