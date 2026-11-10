import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

// The emergency screen is deliberately loud — it stays red on a dark scrim in
// both themes.
export const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.overlayStrong,
      justifyContent: 'center',
      alignItems: 'center',
    },
    container: {
      width: '80%',
      backgroundColor: c.danger,
      borderRadius: 20,
      padding: 30,
      alignItems: 'center',
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 10,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.onDanger,
      marginBottom: 30,
      textAlign: 'center',
    },
    countdown: {
      fontSize: 120,
      fontWeight: 'bold',
      color: c.onDanger,
      marginVertical: 20,
    },
    message: {
      fontSize: 18,
      color: c.onDanger,
      marginBottom: 30,
      textAlign: 'center',
    },
    cancelButton: {
      backgroundColor: c.onDanger,
      paddingVertical: 15,
      paddingHorizontal: 40,
      borderRadius: 10,
    },
    cancelButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: c.danger,
    },
  });
