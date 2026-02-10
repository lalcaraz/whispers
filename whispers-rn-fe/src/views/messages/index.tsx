import { View, Alert, TextInput, TouchableOpacity, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '@/navigation';
import MessageList from '@components/messageList';
import useNavBar from '@hooks/useNavBar';
import useTranslation from '@hooks/useTranslation';
import useConversations from '@hooks/useConversations';
import { encryptMessage, getKeys } from '@/utils/keys';
import { styles } from './styles';
import useMessages, { MessagesProvider } from '@hooks/useMessages';
import useBackend from '@hooks/useBackend';

type MessagesViewProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Messages'>;
    route: RouteProp<RootStackParamList, 'Messages'>;
};

function MessagesViewContent({ navigation, route }: MessagesViewProps) {
    const { setTitle, setRightAction, setLeftAction, reset } = useNavBar();
    const { createItem, readItems } = useMessages();
    const { conversations } = useConversations();
    const { t } = useTranslation();
    const { conversationId } = route.params;
    const [messageText, setMessageText] = useState('');
    const { sendMessage, error } = useBackend();

    // Get the current conversation to access recipient's public key
    const conversation = conversations.find(c => c.id === conversationId);
    
    // Poll for new messages every 2 seconds when screen is focused
    useEffect(() => {
        const interval = setInterval(() => {
            readItems(conversationId);
        }, 2000);
        
        return () => clearInterval(interval);
    }, [conversationId, readItems]);

    const handleSendMessage = useCallback(async () => {
        if (!messageText.trim() || !conversation) return;

        try {
            // Encrypt the message with recipient's public key (no conversationId needed)
            const encryptedData = await encryptMessage(
                messageText.trim(),
                conversation.recipientPublicKey
            );

            const success = await sendMessage({
                encryptedMessage: encryptedData.message,
                destination: encryptedData.destination,
                origin: (await getKeys()).publicKey
            });
            
            if (!success) {
                // Check if it's a recipient not found error
                if (error?.includes('not registered')) {
                    Alert.alert(
                        'Recipient Not Found',
                        'The recipient is not registered with the backend. They need to open the app and register their public key first.',
                        [{ text: 'OK' }]
                    );
                } else {
                    Alert.alert('Error', 'Failed to send message. Please try again.');
                }
                return;
            }
            
            await createItem(messageText.trim(), conversationId);
            setMessageText('');
        } catch (error) {
            console.error('Error sending message:', error);
            Alert.alert('Error', 'Failed to encrypt and send message');
        }
    }, [messageText, createItem, conversationId, conversation, sendMessage, error]);

    const handleLeftAction = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            reset();
            setTitle(t.messages.title);
            setLeftAction(handleLeftAction, '←');
        }, [setTitle, setLeftAction, setRightAction, t, handleLeftAction])
    );

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={100}
        >
            <View style={styles.messagesContainer}>
                <MessageList />
            </View>
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Type a message..."
                    value={messageText}
                    onChangeText={setMessageText}
                    multiline
                    maxLength={1000}
                    returnKeyType="send"
                    onSubmitEditing={handleSendMessage}
                    blurOnSubmit={false}
                />
                <TouchableOpacity
                    style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
                    onPress={handleSendMessage}
                    disabled={!messageText.trim()}
                >
                    <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

export default function MessagesView(props: MessagesViewProps) {
    return (
        <MessagesProvider key={props.route.params.conversationId} conversationId={props.route.params.conversationId}>
            <MessagesViewContent {...props} />
        </MessagesProvider>
    );
}