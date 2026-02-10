import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  messagesContainer: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
