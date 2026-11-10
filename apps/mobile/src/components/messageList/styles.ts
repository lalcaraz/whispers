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
    localMessageContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 12,
    },
    incomingMessageContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 12,
    },
    messageCard: {
      padding: 12,
      borderRadius: 16,
      maxWidth: '75%',
    },
    localMessage: {
      backgroundColor: c.bubbleOutgoing,
      borderBottomRightRadius: 4,
    },
    incomingMessage: {
      backgroundColor: c.bubbleIncoming,
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 16,
      marginBottom: 4,
    },
    localMessageText: {
      color: c.onBubbleOutgoing,
    },
    incomingMessageText: {
      color: c.onBubbleIncoming,
    },
    messageDate: {
      fontSize: 11,
    },
    localMessageDate: {
      color: c.onBubbleOutgoingMuted,
    },
    incomingMessageDate: {
      color: c.onBubbleIncomingMuted,
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
