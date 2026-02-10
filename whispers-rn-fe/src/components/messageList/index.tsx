import { FlatList, Text, View, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useCallback, useState, useEffect } from 'react';
import useMessages, { StorageItem } from '@hooks/useMessages';
import useTranslation from '@hooks/useTranslation';
import { getKeys } from '@/utils/keys';
import { styles } from './styles';

export default function MessageList() {
  const { items, loading, error, deleteItem } = useMessages();
  const { t } = useTranslation();
  const [myPublicKey, setMyPublicKey] = useState<string>('');
  
  useEffect(() => {
    getKeys().then(keys => setMyPublicKey(keys.publicKey));
  }, []);

  const handleLongPress = useCallback((item: StorageItem) => {
    Alert.alert(
      t.messages?.deleteTitle || 'Delete Message',
      t.messages?.deleteConfirm || 'Are you sure you want to delete this message?',
      [
        { text: t.common?.cancel || 'Cancel', style: 'cancel' },
        {
          text: t.common?.delete || 'Delete',
          style: 'destructive',
          onPress: () => deleteItem(item.id),
        },
      ]
    );
  }, [deleteItem, t]);

  const renderItem = useCallback(({ item }: { item: StorageItem }) => {
    // If no senderPublicKey, assume it's a local message (old messages)
    const isLocal = !item.senderPublicKey || item.senderPublicKey === myPublicKey;
    
    return (
      <View style={isLocal ? styles.localMessageContainer : styles.incomingMessageContainer}>
        <TouchableOpacity
          style={[styles.messageCard, isLocal ? styles.localMessage : styles.incomingMessage]}
          onLongPress={() => handleLongPress(item)}
          activeOpacity={0.7}
        >
          <Text style={[styles.messageText, isLocal ? styles.localMessageText : styles.incomingMessageText]}>
            {item.value}
          </Text>
          <Text style={[styles.messageDate, isLocal ? styles.localMessageDate : styles.incomingMessageDate]}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [handleLongPress, myPublicKey]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>{t.messages.empty}</Text>
    </View>
  ), [t.messages.empty]);

  const renderFooter = useCallback(() => (
    loading ? <ActivityIndicator style={styles.loader} /> : null
  ), [loading]);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{t.common.error}: {error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      ListEmptyComponent={!loading ? renderEmpty : null}
      ListFooterComponent={renderFooter}
      contentContainerStyle={items.length === 0 ? styles.emptyListContent : styles.listContent}
      style={styles.list}
      extraData={items.length}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={10}
      inverted={items.length > 0}
    />
  );
}
