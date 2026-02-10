import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#000',
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  optionActive: {
    backgroundColor: '#007AFF',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
});
