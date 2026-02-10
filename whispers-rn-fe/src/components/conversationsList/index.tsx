import { FlatList, Text, View, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useCallback } from 'react';
import useConversations, { Conversation } from '@hooks/useConversations';
import useTranslation from '@hooks/useTranslation';
import { styles } from './styles';

type ConversationListProps = {
  onConversationPress?: (conversation: Conversation) => void;
};

export default function ConversationsList({ onConversationPress }: ConversationListProps) {
  const { conversations, loading, error, deleteConversation } = useConversations();
  const { t } = useTranslation();

  const handleLongPress = useCallback((item: Conversation) => {
    Alert.alert(
      t.conversations?.deleteTitle || 'Delete Conversation',
      t.conversations?.deleteConfirm || 'Are you sure you want to delete this conversation and all its messages?',
      [
        { text: t.common?.cancel || 'Cancel', style: 'cancel' },
        {
          text: t.common?.delete || 'Delete',
          style: 'destructive',
          onPress: () => deleteConversation(item.id),
        },
      ]
    );
  }, [deleteConversation, t]);

  const renderItem = useCallback(({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.conversationCard}
      onPress={() => onConversationPress?.(item)}
      onLongPress={() => handleLongPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.conversationHeader}>
        <Text style={styles.conversationTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.conversationDate}>
          {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      {item.lastMessage && (
        <Text style={styles.lastMessage} numberOfLines={2}>
          {item.lastMessage}
        </Text>
      )}
    </TouchableOpacity>
  ), [onConversationPress, handleLongPress]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>{t.conversations?.empty || 'No conversations yet'}</Text>
    </View>
  ), [t]);

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
      data={conversations}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      ListEmptyComponent={!loading ? renderEmpty : null}
      ListFooterComponent={renderFooter}
      contentContainerStyle={conversations.length === 0 ? styles.emptyListContent : styles.listContent}
      style={styles.list}
      extraData={conversations.length}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={10}
    />
  );
}
