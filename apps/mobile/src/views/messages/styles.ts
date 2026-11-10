import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

export const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.surface,
    },
    messagesContainer: {
      flex: 1,
    },
    inputContainer: {
      flexDirection: 'row',
      padding: 12,
      backgroundColor: c.screen,
      borderTopWidth: 1,
      borderTopColor: c.border,
      alignItems: 'center',
      gap: 8,
    },
    input: {
      flex: 1,
      backgroundColor: c.surface,
      color: c.textPrimary,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 16,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: c.border,
    },
    sendButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: c.borderStrong,
    },
    sendButtonText: {
      color: c.onAccent,
      fontSize: 16,
      fontWeight: '600',
    },
  });
