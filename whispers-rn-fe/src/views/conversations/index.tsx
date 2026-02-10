import { View, Image } from 'react-native';
import { useEffect, useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { RootStackParamList } from '@/navigation';
import ConversationsList from '@components/conversationsList';
import QRScanner from '@components/qrScanner';
import useNavBar from '@hooks/useNavBar';
import useTranslation from '@hooks/useTranslation';
import useConversations, { Conversation } from '@hooks/useConversations';
import { styles } from './styles';

type ConversationsViewProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Conversations'>;
};

export default function ConversationsView({ navigation }: ConversationsViewProps) {
    const { setTitle, setRightAction, setLeftAction, reset } = useNavBar();
    const { createConversation, deleteAllConversations, readConversations } = useConversations();
    const { t } = useTranslation();
    const [showScanner, setShowScanner] = useState(false);

    const handleRightAction = useCallback(() => {
        setShowScanner(true);
    }, []);

    const handleScanComplete = useCallback(async (publicKey: string, conversationName: string) => {
        await createConversation(conversationName, publicKey);
        setShowScanner(false);
    }, [createConversation]);

    const handleLeftAction = useCallback(() => {
        navigation.navigate('Profile');
    }, [navigation]);

    const handleConversationPress = useCallback((conversation: Conversation) => {
        navigation.navigate('Messages', { conversationId: conversation.id });
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            reset();
            setTitle(t.conversations?.title || 'Conversations');
            setLeftAction(handleLeftAction, '👤');
            setRightAction(handleRightAction, '+');
            // Refresh conversations list when screen is focused
            readConversations();
        }, [setTitle, setLeftAction, setRightAction, t, handleLeftAction, handleRightAction, readConversations])
    );

    return (
        <View style={styles.container}>
            <ConversationsList onConversationPress={handleConversationPress} />
            <QRScanner 
                visible={showScanner}
                onClose={() => setShowScanner(false)}
                onScanComplete={handleScanComplete}
            />
        </View>
    );
}
