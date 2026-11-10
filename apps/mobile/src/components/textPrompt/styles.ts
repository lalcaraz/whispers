import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

export const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 20,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: c.textPrimary,
      marginBottom: 12,
    },
    input: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: c.textPrimary,
      marginBottom: 16,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      marginLeft: 8,
    },
    cancel: {
      backgroundColor: c.surfaceAlt,
    },
    confirm: {
      backgroundColor: c.accent,
    },
    cancelText: {
      color: c.textPrimary,
      fontWeight: '600',
    },
    confirmText: {
      color: c.onAccent,
      fontWeight: '600',
    },
  });
