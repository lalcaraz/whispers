import { useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { getKeys, signMessage } from '@/utils/keys';
import { DEFAULT_BACKEND_URL, STORAGE_KEYS, NETWORK_CONFIG } from '@/constants';

export default function useBackend() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getBackendUrl = async (): Promise<string> => {
        try {
            const url = await SecureStore.getItemAsync(STORAGE_KEYS.BACKEND_URL);
            return url || DEFAULT_BACKEND_URL;
        } catch (error) {
            console.error('Error getting backend URL:', error);
            return DEFAULT_BACKEND_URL;
        }
    };

    /**
     * Register device with backend
     * Sends push notification token and public key
     */
    const register = useCallback(async (pushToken: string): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            const backendUrl = await getBackendUrl();
            const { publicKey } = await getKeys();
            
            // Test basic connectivity first
            try {
                const testResponse = await axios.get('https://www.google.com', { timeout: 5000 });
            } catch (testErr) {
                // Connectivity check failed
            }

            const response = await axios.post(`${backendUrl}/register`, {
                expoPushToken: pushToken,
                recipientId: publicKey,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    'User-Agent': 'WhispersApp',
                },
                timeout: 30000, // 30 second timeout
            });
            
            // Store push token for later use (e.g., key regeneration)
            await SecureStore.setItemAsync(STORAGE_KEYS.PUSH_TOKEN, pushToken);
            
            // Store registration timestamp
            await SecureStore.setItemAsync(
                STORAGE_KEYS.LAST_REGISTRATION_TIME, 
                Date.now().toString()
            );
            
            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to register with backend';
            console.error('❌ Registration error:', errorMessage);
            if (axios.isAxiosError(err)) {
                console.error('Axios error details:', {
                    message: err.message,
                    code: err.code,
                    status: err.response?.status,
                    data: err.response?.data,
                    url: err.config?.url,
                    method: err.config?.method,
                });
                
                // Check for rate limiting (429)
                if (err.response?.status === 429) {
                    setError('Too many registration attempts. Please wait 15 minutes and try again.');
                    return false;
                }
            }
            setError(errorMessage);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Check if registration needs to be refreshed
     * Returns true if registration is older than 20 hours
     */
    const needsRegistrationRefresh = useCallback(async (): Promise<boolean> => {
        try {
            const lastRegTime = await SecureStore.getItemAsync(STORAGE_KEYS.LAST_REGISTRATION_TIME);
            if (!lastRegTime) {
                return true; // No registration timestamp, needs registration
            }
            
            const lastRegTimestamp = parseInt(lastRegTime, 10);
            const timeSinceReg = Date.now() - lastRegTimestamp;
            
            // Refresh if older than 20 hours (before 24hr expiry)
            return timeSinceReg > NETWORK_CONFIG.REGISTRATION_REFRESH_INTERVAL;
        } catch (error) {
            console.error('Error checking registration time:', error);
            return true; // Default to needing refresh on error
        }
    }, []);

    /**
     * Get stored push token
     * Returns null if no token is stored
     */
    const getStoredPushToken = useCallback(async (): Promise<string | null> => {
        try {
            return await SecureStore.getItemAsync(STORAGE_KEYS.PUSH_TOKEN);
        } catch (error) {
            console.error('Error getting push token:', error);
            return null;
        }
    }, []);

    /**
     * Refresh registration if needed
     * Automatically re-registers if registration is stale
     */
    const refreshRegistrationIfNeeded = useCallback(async (): Promise<boolean> => {
        const needsRefresh = await needsRegistrationRefresh();
        
        if (!needsRefresh) {
            return true; // Registration is still valid
        }
        
        // Get stored push token and re-register
        const pushToken = await getStoredPushToken();
        if (!pushToken) {
            console.error('No push token stored, cannot refresh registration');
            return false;
        }
        
        return await register(pushToken);
    }, [needsRegistrationRefresh, getStoredPushToken, register]);

    /**
     * Send encrypted message to backend
     */
    const sendMessage = useCallback(async (payload: {
        origin: string;
        destination: string;
        encryptedMessage: string;
    }): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            const backendUrl = await getBackendUrl();
            
            // Generate timestamp for signature
            const timestamp = Date.now();
            
            // Create message for signing: timestamp + destination + encryptedMessage
            const messageToSign = `${timestamp}${payload.destination}${payload.encryptedMessage}`;
            
            // Sign the message with Ed25519 private key
            const signature = await signMessage(messageToSign);
            
            // Add timestamp and signature to request body
            const authenticatedPayload = {
                ...payload,
                timestamp,
                signature
            };
            
            const response = await axios.post(`${backendUrl}/send`, authenticatedPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    'User-Agent': 'WhispersApp',
                },
                timeout: 10000, // 10 second timeout
            });

            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
            console.error('❌ Send message error:', errorMessage);
            if (axios.isAxiosError(err)) {
                console.error('Axios error details:', {
                    message: err.message,
                    code: err.code,
                    status: err.response?.status,
                    data: err.response?.data,
                });
                
                // Check for authentication failures (401) or forbidden (403)
                // This likely means registration expired - try to re-register and retry
                if (err.response?.status === 401 || err.response?.status === 403) {
                    const responseData = err.response?.data;
                    const errorText = typeof responseData === 'string' ? responseData : '';
                    
                    // Check if it's a registration issue (not just invalid signature)
                    if (errorText.includes('not registered') || errorText.includes('expired') || err.response?.status === 403) {
                        // Try to re-register
                        const pushToken = await getStoredPushToken();
                        if (pushToken) {
                            const reregistered = await register(pushToken);
                            if (reregistered) {
                                // Retry sending the message
                                setLoading(true);
                                try {
                                    const backendUrlRetry = await getBackendUrl();
                                    const retryTimestamp = Date.now();
                                    const retryMessageToSign = `${retryTimestamp}${payload.destination}${payload.encryptedMessage}`;
                                    const retrySignature = await signMessage(retryMessageToSign);
                                    
                                    const retryPayload = {
                                        ...payload,
                                        timestamp: retryTimestamp,
                                        signature: retrySignature
                                    };
                                    
                                    await axios.post(`${backendUrlRetry}/send`, retryPayload, {
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'ngrok-skip-browser-warning': 'true',
                                            'User-Agent': 'WhispersApp',
                                        },
                                        timeout: 10000,
                                    });
                                    
                                    return true; // Success after re-registration and retry
                                } catch (retryErr) {
                                    console.error('Message send failed after re-registration:', retryErr);
                                    setError('Failed to send message after re-registration');
                                    return false;
                                } finally {
                                    setLoading(false);
                                }
                            }
                        }
                    }
                    
                    if (errorText.includes('Invalid or expired signature')) {
                        setError('Authentication failed: Invalid or expired signature');
                    } else {
                        setError('Authentication failed: Please check your connection and try again');
                    }
                    return false;
                }
                
                // Check for recipient not found (404)
                if (err.response?.status === 404) {
                    setError('Recipient not registered with backend');
                    return false;
                }
                
                // Check for payload too large (413)
                if (err.response?.status === 413) {
                    setError('Message too large. Maximum size is 10KB.');
                    return false;
                }
                
                // Check for rate limiting (429)
                if (err.response?.status === 429) {
                    setError('Too many requests. Please wait a few minutes and try again.');
                    return false;
                }
                
                // Check for bad request (400) - might be signature format issue
                if (err.response?.status === 400) {
                    const responseData = err.response?.data;
                    if (typeof responseData === 'string' && responseData.includes('Invalid signature format')) {
                        setError('Invalid signature format');
                    } else {
                        setError('Bad request: Invalid data format');
                    }
                    return false;
                }
            }
            setError(errorMessage);
            return false;
        } finally {
            setLoading(false);
        }
    }, [register, getStoredPushToken]);

    return {
        loading,
        error,
        register,
        sendMessage,
        getStoredPushToken,
        refreshRegistrationIfNeeded,
    };
}
