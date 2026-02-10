import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
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
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  incomingMessage: {
    backgroundColor: '#E9E9EB',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    marginBottom: 4,
  },
  localMessageText: {
    color: '#FFFFFF',
  },
  incomingMessageText: {
    color: '#000000',
  },
  messageDate: {
    fontSize: 11,
  },
  localMessageDate: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  incomingMessageDate: {
    color: '#666666',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ff3b30',
    textAlign: 'center',
  },
  loader: {
    marginVertical: 20,
  },
});
