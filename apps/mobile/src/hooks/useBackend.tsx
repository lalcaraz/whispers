import { useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { registerDevice, sendEncrypted, BackendError } from '@/utils/backendClient';
import { STORAGE_KEYS, NETWORK_CONFIG } from '@/constants';

type SendPayload = {
  origin: string;
  destination: string;
  encryptedMessage: string;
};

export default function useBackend() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Register / refresh this device with the backend. Returns success. */
  const register = useCallback(async (pushToken: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await registerDevice(pushToken);
      await SecureStore.setItemAsync(STORAGE_KEYS.PUSH_TOKEN, pushToken);
      await SecureStore.setItemAsync(
        STORAGE_KEYS.LAST_REGISTRATION_TIME,
        Date.now().toString()
      );
      return true;
    } catch (err) {
      if (err instanceof BackendError && err.status === 429) {
        setError('Too many registration attempts. Please wait 15 minutes and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to register with backend');
      }
      console.error('Registration error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStoredPushToken = useCallback(async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.PUSH_TOKEN);
    } catch (err) {
      console.error('Error getting push token:', err);
      return null;
    }
  }, []);

  const needsRegistrationRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const last = await SecureStore.getItemAsync(STORAGE_KEYS.LAST_REGISTRATION_TIME);
      if (!last) return true;
      return Date.now() - parseInt(last, 10) > NETWORK_CONFIG.REGISTRATION_REFRESH_INTERVAL;
    } catch (err) {
      console.error('Error checking registration time:', err);
      return true;
    }
  }, []);

  const refreshRegistrationIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!(await needsRegistrationRefresh())) return true;
    const pushToken = await getStoredPushToken();
    if (!pushToken) {
      console.error('No push token stored, cannot refresh registration');
      return false;
    }
    return register(pushToken);
  }, [needsRegistrationRefresh, getStoredPushToken, register]);

  /** Send an encrypted message. Resolves to `{ ok, error }`. */
  const sendMessage = useCallback(
    async (payload: SendPayload): Promise<{ ok: boolean; error: string | null }> => {
      setLoading(true);
      setError(null);
      try {
        await sendEncrypted(payload);
        return { ok: true, error: null };
      } catch (err) {
        let message = err instanceof Error ? err.message : 'Failed to send message';
        if (err instanceof BackendError) {
          switch (err.status) {
            case 401:
              message = 'Authentication failed. Check your device clock and try again.';
              break;
            case 403:
              message = 'This contact has not added you. Ask them to scan your QR code and add you back.';
              break;
            case 404:
              message = 'Recipient is not registered with the backend.';
              break;
            case 413:
              message = 'Message too large. Maximum size is 10KB.';
              break;
            case 429:
              message = 'Too many requests. Please wait a few minutes and try again.';
              break;
            default:
              break;
          }
        }
        setError(message);
        console.error('Send message error:', err);
        return { ok: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    register,
    sendMessage,
    getStoredPushToken,
    refreshRegistrationIfNeeded,
  };
}
