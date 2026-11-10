import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

export const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    list: {
      flex: 1,
      width: '100%',
    },
    listContent: {
      padding: 16,
    },
    emptyListContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    conversationCard: {
      backgroundColor: c.surfaceAlt,
      padding: 16,
      borderRadius: 8,
      marginBottom: 12,
    },
    conversationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    conversationTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: c.textPrimary,
      flex: 1,
      marginRight: 12,
    },
    conversationDate: {
      fontSize: 12,
      color: c.textMuted,
    },
    lastMessage: {
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 20,
    },
    emptyContainer: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 16,
      color: c.textMuted,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 16,
      color: c.danger,
      textAlign: 'center',
    },
    loader: {
      marginVertical: 20,
    },
  });
