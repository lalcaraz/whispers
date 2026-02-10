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
  conversationCard: {
    backgroundColor: '#f5f5f5',
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
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  conversationDate: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
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
