import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { NavigationContainer } from '@react-navigation/native';
import { useState, useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import NavBar from '@components/navBar';
import EmergencyCountdown from '@components/emergencyCountdown';
import { NavBarProvider } from '@hooks/useNavBar';
import { TranslationProvider } from '@hooks/useTranslation';
import { ConversationsProvider } from '@hooks/useConversations';
import useConversations from '@hooks/useConversations';
import useShakeDetection from '@hooks/useShakeDetection';
import useBackend from '@hooks/useBackend';
import useTranslation from '@hooks/useTranslation';
import { RootNavigator } from '@/navigation';
import { initializeDatabase, resetDatabase, insertReceivedMessage, updateConversationTitle } from './utils/database';
import { clearKeys, decryptMessage, debugEncryptMessage, getKeys, generateConversationId } from './utils/keys';
import { Alert } from 'react-native';
import { DEFAULT_BACKEND_URL, EAS_PROJECT_ID } from './constants';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  return (
    <SafeAreaProvider>
      <TranslationProvider>
        <ConversationsProvider>
          <NavBarProvider>
            <NavigationContainer>
              <AppContent />
            </NavigationContainer>
          </NavBarProvider>
        </ConversationsProvider>
      </TranslationProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  usePreventScreenCapture();
  const [showEmergency, setShowEmergency] = useState(false);
  const isProcessingShake = useRef(false);
  const shakeCount = useRef(0);
  const lastShakeTime = useRef(0);
  const { register, refreshRegistrationIfNeeded } = useBackend();
  const { readConversations } = useConversations();
  const { t } = useTranslation();

  // Initialize database on first launch
  useEffect(() => {
    initializeDatabase().catch(error => {
      console.error('Failed to initialize database:', error);
    });
  }, []);

  // Test network connectivity
  useEffect(() => {
    console.log('🔍 Testing network connectivity...');
    fetch('https://www.google.com')
      .then(res => console.log('✅ fetch() works!', res.status))
      .catch(err => console.error('❌ fetch() failed:', err.message));
    
    // Test fetch to backend health endpoint
    fetch(`${DEFAULT_BACKEND_URL}/health`, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      }
    })
      .then(res => console.log('✅ fetch() backend /health works!', res.status))
      .catch(err => console.error('❌ fetch() backend /health failed:', err.message));
    
    // Test axios
    import('axios').then(axios => {
      axios.default.get('https://www.google.com', { timeout: 5000 })
        .then(res => console.log('✅ axios GET google works!', res.status))
        .catch(err => console.error('❌ axios GET google failed:', err.message, err.code));
      
      // Test axios GET to backend health endpoint
      axios.default.get(`${DEFAULT_BACKEND_URL}/health`, { 
        timeout: 5000,
        headers: {
          'ngrok-skip-browser-warning': 'true',
        }
      })
        .then(res => console.log('✅ axios GET backend works!', res.status))
        .catch(err => console.error('❌ axios GET backend failed:', err.message, err.code));
    });
  }, []);

  // Register for push notifications
  useEffect(() => {
    registerForPushNotifications(register);
    
    // Refresh registration if needed (every 20 hours)
    refreshRegistrationIfNeeded().catch((error: unknown) => {
      console.error('Failed to refresh registration:', error);
    });

    // Listener for notifications received while app is foregrounded
    const notificationListener = Notifications.addNotificationReceivedListener(async notification => {
      const incomingData = notification.request.content.data || {};
      
      if (!incomingData.destination || !incomingData.encryptedMessage) {
        return;
      }

      const decrypted = await decryptMessage(
        {
          origin: notification.request.content.data.origin as string,
          destination: notification.request.content.data.destination as string,
          encryptedMessage: notification.request.content.data.encryptedMessage as { encrypted: string; signature: string; payload: any }
        }
      );


      if (decrypted) {
        try {
            // Generate deterministic conversation ID from both public keys
            const { publicKey: localPublicKey } = await getKeys();
            const conversationId = await generateConversationId(localPublicKey, decrypted.senderPublicKey);
            
            // Save the decrypted message to the database
            const result = await insertReceivedMessage(
              decrypted.message,
              conversationId,
              decrypted.senderPublicKey,
              new Date(decrypted.timestamp).toISOString()
            );
            
            // If this is a new conversation, prompt user to name the contact
            if (result.isNewConversation) {
              Alert.prompt(
                t.conversations?.newContactTitle || 'New Contact',
                t.conversations?.newContactMessage || 'You received a message from a new contact. Give them a name:',
                [
                  {
                    text: t.common?.cancel || 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: t.common?.save || 'Save',
                    onPress: async (contactName: string | undefined) => {
                      if (contactName && contactName.trim()) {
                        await updateConversationTitle(result.conversationId, contactName.trim());
                        await readConversations();
                      }
                    },
                  },
                ],
                'plain-text',
                '',
                'default'
              );
            }
            
            // Refresh conversations list to show the new message
            await readConversations();
        } catch (error) {
          console.error('Error saving received message:', error); 
        }
      }
    });

    // Listener for when user taps on notification
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      // Navigation or other actions can be added here
    });

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, [readConversations]);

  const handleShake = useCallback(() => {
    // Prevent triggering when emergency is already shown
    if (showEmergency) {
      return;
    }

    const now = Date.now();
    const timeSinceLastShake = now - lastShakeTime.current;

    // Reset shake count if more than 3 seconds have passed
    if (timeSinceLastShake > 3000) {
      shakeCount.current = 0;
    }

    shakeCount.current += 1;
    lastShakeTime.current = now;

    // Require 10 shakes within 3 seconds to trigger emergency
    if (shakeCount.current >= 10) {
      setShowEmergency(true);
      shakeCount.current = 0; // Reset after triggering
    }
  }, [showEmergency]);

  const handleCancel = useCallback(() => {
    setShowEmergency(false);
    shakeCount.current = 0;
    lastShakeTime.current = 0;
  }, []);

  const handleComplete = useCallback(async () => {
    setShowEmergency(false);
    await resetDatabase();
    await clearKeys();
    setTimeout(() => {
      throw new Error('Emergency wipe completed');
    }, 100);
  }, []);

  useShakeDetection(handleShake);

  return (
    <>
      <NavBar />
      <RootNavigator />
      <EmergencyCountdown
        visible={showEmergency}
        onCancel={handleCancel}
        onComplete={handleComplete}
      />
    </>
  );
}

async function registerForPushNotifications(register: (pushToken: string) => Promise<boolean>) {
  try {
    console.log('🔔 Starting push notification registration...');
    
    if (!Device.isDevice) {
      console.log('⚠️ Not a physical device, skipping push notifications');
      return;
    }

    console.log('📱 Checking existing notification permissions...');
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('Current permission status:', existingStatus);
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
      console.log('🔑 Requesting notification permissions...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('Permission request result:', status);
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Notification permissions not granted');
      return;
    }

    console.log('✅ Notification permissions granted, getting push token...');
    // Get the push token
    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID || undefined,
    });
    console.log('✅ Got push token:', pushToken.data);
    
    // Register with backend
    console.log('📡 Registering with backend...');
    const success = await register(pushToken.data);
    console.log('Backend registration result:', success);

    // Configure Android channel
    if (Platform.OS === 'android') {
      console.log('🔔 Configuring Android notification channel...');
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
      console.log('✅ Android notification channel configured');
    }
  } catch (error) {
    console.error('❌ Error registering for push notifications:', error);
    Alert.alert(
      'Registration Failed',
      'Could not register for push notifications. The backend may be unavailable. Please check your server URL in Profile settings.',
      [{ text: 'OK' }]
    );
  }
}
