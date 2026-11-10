import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useState, useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import NavBar from '@components/navBar';
import EmergencyCountdown from '@components/emergencyCountdown';
import { NavBarProvider } from '@hooks/useNavBar';
import { TranslationProvider } from '@hooks/useTranslation';
import { ThemeProvider } from '@hooks/useTheme';
import useTheme from '@hooks/useTheme';
import { ConversationsProvider } from '@hooks/useConversations';
import useConversations from '@hooks/useConversations';
import useShakeDetection from '@hooks/useShakeDetection';
import useBackend from '@hooks/useBackend';
import useTranslation from '@hooks/useTranslation';
import { RootNavigator } from '@/navigation';
import Constants from 'expo-constants';
import { initializeDatabase, insertReceivedMessage } from './utils/database';
import {
  decryptMessage,
  getKeys,
  generateConversationId,
  ensureKeys,
  consumeKeyRegeneratedNotice,
} from './utils/keys';
import { emergencyWipe } from './utils/wipe';
import { Alert, View } from 'react-native';

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
  // Gate: the encrypted database must be open and a key pair must exist before
  // any provider (which reads the DB synchronously) mounts.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initializeDatabase();
        await ensureKeys();
      } catch (error) {
        console.error('Startup initialization failed:', error);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedRoot ready={ready} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Inside ThemeProvider so it can theme the status bar, navigation, and the
 *  pre-`ready` background. */
function ThemedRoot({ ready }: { ready: boolean }) {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {ready ? (
        <TranslationProvider>
          <ConversationsProvider>
            <NavBarProvider>
              <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
                <AppContent />
              </NavigationContainer>
            </NavBarProvider>
          </ConversationsProvider>
        </TranslationProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.screen }} />
      )}
    </>
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

  // Database and keys are ready by the time AppContent mounts (see App gate).
  // Surface the one-time notice if keys were force-regenerated at startup.
  useEffect(() => {
    consumeKeyRegeneratedNotice()
      .then(regenerated => {
        if (regenerated) {
          Alert.alert(
            t.profile?.keysUpgradedTitle || 'Keys upgraded',
            t.profile?.keysUpgradedNotice ||
              'Your keys were upgraded for security. Your previous identity was replaced — share your QR code again and ask your contacts to add you back.',
            [{ text: 'OK' }]
          );
        }
      })
      .catch(error => {
        console.error('Failed to read key notice:', error);
      });
  }, [t]);

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

      // decryptMessage returns null unless the signature verifies against `origin`
      // AND the identity inside the plaintext matches `origin`. `decrypted.senderPublicKey`
      // is therefore the authenticated sender, safe to key the conversation on.
      const decrypted = await decryptMessage(
        {
          origin: incomingData.origin as string,
          destination: incomingData.destination as string,
          encryptedMessage: incomingData.encryptedMessage as { encrypted: string; nonce: string; signature: string }
        }
      );

      if (decrypted) {
        try {
            // Generate deterministic conversation ID from both public keys
            const { publicKey: localPublicKey } = await getKeys();
            const conversationId = await generateConversationId(localPublicKey, decrypted.senderPublicKey);
            
            // Save the decrypted message. A brand-new conversation is stored as
            // "Unknown Contact"; the user renames it from the conversations list
            // (long-press > Rename) - Alert.prompt is iOS-only so we don't use it.
            await insertReceivedMessage(
              decrypted.message,
              conversationId,
              decrypted.senderPublicKey,
              new Date(decrypted.timestamp).toISOString()
            );

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
    try {
      await emergencyWipe();
    } catch (error) {
      console.error('Emergency wipe error:', error);
    }
    // Force the app to restart into a clean state.
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

    // EAS project id comes from app config (extra.eas.projectId), set via the
    // EAS_PROJECT_ID env var - see .env.example.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.warn('No EAS project id configured; push registration skipped.');
      return;
    }
    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    
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
