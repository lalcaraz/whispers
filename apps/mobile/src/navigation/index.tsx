import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConversationsView from '@views/conversations';
import MessagesView from '@views/messages';
import ProfileView from '@views/profile';

export type RootStackParamList = {
  Conversations: undefined;
  Messages: { conversationId: string };
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Conversations" component={ConversationsView} />
      <Stack.Screen name="Messages" component={MessagesView} />
      <Stack.Screen name="Profile" component={ProfileView} />
    </Stack.Navigator>
  );
}
