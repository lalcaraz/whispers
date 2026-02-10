import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useCallback, useState, useEffect } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '@/navigation';
import useNavBar from '@hooks/useNavBar';
import useTranslation from '@hooks/useTranslation';
import { deleteAllData } from '@/utils/database';
import { getKeys, regenerateKeys } from '@/utils/keys';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import useBackend from '@hooks/useBackend';
import { DEFAULT_BACKEND_URL, STORAGE_KEYS } from '@/constants';
import { Locale, localeNames } from '@/locales';
import { styles } from './styles';

type ProfileViewProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
};

export default function ProfileView({ navigation }: ProfileViewProps) {
    const { setTitle, setLeftAction, reset } = useNavBar();
    const { t, locale, setLocale } = useTranslation();
    const { register, getStoredPushToken } = useBackend();
    const [publicKey, setPublicKey] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
    const [isEditingUrl, setIsEditingUrl] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);

    // Generate or load keys
    useEffect(() => {
        loadKeys();
        loadBackendUrl();
    }, []);

    const loadKeys = async () => {
        const keys = await getKeys();
        setPublicKey(keys.publicKey);
        setPrivateKey(keys.privateKey);
    };

    const loadBackendUrl = async () => {
        try {
            const url = await SecureStore.getItemAsync(STORAGE_KEYS.BACKEND_URL);
            if (url) {
                setBackendUrl(url);
            }
        } catch (error) {
            console.error('Error loading backend URL:', error);
        }
    };

    const handleLanguageChange = async (newLocale: Locale) => {
        try {
            await SecureStore.setItemAsync(STORAGE_KEYS.LOCALE, newLocale);
            setLocale(newLocale);
        } catch (error) {
            console.error('Error saving language:', error);
            Alert.alert(t.common?.error || 'Error', 'Failed to save language preference');
        }
    };

    const saveBackendUrl = async (url: string) => {
        try {
            await SecureStore.setItemAsync(STORAGE_KEYS.BACKEND_URL, url);
            setBackendUrl(url);
            setIsEditingUrl(false);
            Alert.alert(t.common?.success || 'Success', t.profile?.backendUrlUpdated || 'Backend URL updated');
        } catch (error) {
            console.error('Error saving backend URL:', error);
            Alert.alert(t.common?.error || 'Error', t.profile?.backendUrlSaveFailed || 'Failed to save backend URL');
        }
    };

    const handleSaveUrl = () => {
        if (!backendUrl.trim()) {
            Alert.alert(t.common?.error || 'Error', t.profile?.backendUrlEmpty || 'Backend URL cannot be empty');
            return;
        }
        if (!backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
            Alert.alert(t.common?.error || 'Error', t.profile?.backendUrlInvalid || 'Backend URL must start with http:// or https://');
            return;
        }
        saveBackendUrl(backendUrl.trim());
    };

    const handleLeftAction = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const copyToClipboard = async (text: string, label: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert(t.common?.success || 'Success', `${label} ${t.profile?.copied || 'copied to clipboard'}`);
    };

    const handleRegenerateKeys = useCallback(() => {
        Alert.alert(
            t.profile?.regenerateTitle || 'Regenerate Keys',
            t.profile?.regenerateConfirm || 'This will create a new key pair and delete all conversations and messages. Your old private key will be lost forever. Continue?',
            [
                { text: t.common?.cancel || 'Cancel', style: 'cancel' },
                {
                    text: t.profile?.regenerate || 'Regenerate',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsRegenerating(true);
                            
                            await deleteAllData();
                            
                            const keys = await regenerateKeys();
                            
                            setPublicKey(keys.publicKey);
                            setPrivateKey(keys.privateKey);                                  
                            
                            // Re-register with backend using new public key
                            const pushToken = await getStoredPushToken();
                            if (pushToken) {
                                const success = await register(pushToken);
                                if (success) {
                                    Alert.alert(
                                        t.common?.success || 'Success',
                                        t.profile?.keysRegeneratedWithBackend || 'Keys regenerated and re-registered with backend'
                                    );
                                } else {
                                    Alert.alert(
                                        t.common?.warning || 'Warning',
                                        t.profile?.keysRegeneratedBackendFailed || 'Keys regenerated but failed to re-register with backend'
                                    );
                                }
                            } else {
                                Alert.alert(
                                    t.common?.success || 'Success',
                                    t.profile?.keysRegeneratedSuccess || 'Keys regenerated successfully'
                                );
                            }
                        } catch (error) {
                            console.error('Key regeneration failed:', error);
                            Alert.alert(
                                'Error',
                                'Failed to regenerate keys: ' + (error as Error).message
                            );
                        } finally {
                            setIsRegenerating(false);
                        }
                    },
                },
            ]
        );
    }, [t]);

    const handleResetDatabase = useCallback(() => {
        Alert.alert(
            t.profile?.resetDatabaseTitle || 'Reset Database',
            t.profile?.resetDatabaseConfirm || 'This will delete all conversations and messages. Continue?',
            [
                { text: t.common?.cancel || 'Cancel', style: 'cancel' },
                {
                    text: t.profile?.reset || 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteAllData();
                        setBackendUrl(DEFAULT_BACKEND_URL);
                        await SecureStore.setItemAsync(STORAGE_KEYS.BACKEND_URL, DEFAULT_BACKEND_URL);
                        Alert.alert(
                            t.common?.success || 'Success',
                            t.profile?.databaseResetSuccess || 'Database reset successfully'
                        );
                    },
                },
            ]
        );
    }, [t]);

    useFocusEffect(
        useCallback(() => {
            reset();
            setTitle(t.profile?.title || 'Profile');
            setLeftAction(handleLeftAction, '←');
        }, [setTitle, setLeftAction, t, handleLeftAction])
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <TouchableOpacity 
                style={[styles.regenerateButton, isRegenerating && styles.regenerateButtonDisabled]} 
                onPress={handleRegenerateKeys} 
                onLongPress={handleResetDatabase}
                disabled={isRegenerating}
            >
                {isRegenerating ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={styles.regenerateButtonText}>{t.profile?.regenerate || 'Regenerate Keys'}</Text>
                )}
            </TouchableOpacity>

            <View style={styles.qrSection}>
                <View style={styles.qrContainer}>
                    {publicKey ? (
                        <QRCode
                            value={publicKey}
                            size={200}
                            backgroundColor="white"
                            color="black"
                        />
                    ) : (
                        <View style={styles.qrPlaceholder}>
                            <Text style={styles.qrPlaceholderText}>{t.common?.loading || 'Loading...'}</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.keySection}>
                <View style={styles.keyContainer}>
                    <View style={styles.keyHeader}>
                        <Text style={styles.keyLabel}>{t.profile?.publicKey || 'Public Key'}</Text>
                        <TouchableOpacity
                            style={styles.copyButton}
                            onPress={() => copyToClipboard(publicKey, t.profile?.publicKey || 'Public Key')}
                        >
                            <Text style={styles.copyButtonText}>{t.common?.copy || 'Copy'}</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={styles.keyInput}
                        value={publicKey}
                        editable={false}
                        multiline
                        numberOfLines={2}
                        selectTextOnFocus
                    />
                </View>

                <View style={styles.keyContainer}>
                    <View style={styles.keyHeader}>
                        <Text style={styles.keyLabel}>{t.profile?.privateKey || 'Private Key'}</Text>
                    </View>
                    <TextInput
                        style={[styles.keyInput, styles.privateKeyInput]}
                        value={privateKey ? `${privateKey.slice(0, 10)}...${privateKey.slice(-10)}` : ''}
                        editable={false}
                        multiline
                        numberOfLines={2}
                        selectTextOnFocus={false}
                    />
                    <Text style={styles.privateKeyNote}>
                        {t.profile?.privateKeyNote || 'Private key is hidden for security'}
                    </Text>
                </View>
            </View>

            <View style={styles.warningSection}>
                <Text style={styles.warningText}>
                    ⚠️ {t.profile?.warning || 'Never share your private key with anyone. Store it securely.'}
                </Text>
            </View>

            <View style={styles.keySection}>
                <View style={styles.keyContainer}>
                    <View style={styles.keyHeader}>
                        <Text style={styles.keyLabel}>{t.profile?.language || 'Language'}</Text>
                    </View>
                    <View style={styles.languageOptions}>
                        {(Object.keys(localeNames) as Locale[]).map((localeKey) => (
                            <TouchableOpacity
                                key={localeKey}
                                style={[
                                    styles.languageOption,
                                    locale === localeKey && styles.languageOptionActive,
                                ]}
                                onPress={() => handleLanguageChange(localeKey)}
                            >
                                <Text
                                    style={[
                                        styles.languageOptionText,
                                        locale === localeKey && styles.languageOptionTextActive,
                                    ]}
                                >
                                    {localeNames[localeKey]}
                                </Text>
                                {locale === localeKey && (
                                    <Text style={styles.checkmark}>✓</Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>

            <View style={styles.keySection}>
                <View style={styles.keyContainer}>
                    <View style={styles.keyHeader}>
                        <Text style={styles.keyLabel}>{t.profile?.backendUrl || 'Backend URL'}</Text>
                        {!isEditingUrl ? (
                            <TouchableOpacity
                                style={styles.copyButton}
                                onPress={() => setIsEditingUrl(true)}
                            >
                                <Text style={styles.copyButtonText}>{t.common?.edit || 'Edit'}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.copyButton}
                                onPress={handleSaveUrl}
                            >
                                <Text style={styles.copyButtonText}>{t.common?.save || 'Save'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <TextInput
                        style={styles.keyInput}
                        value={backendUrl}
                        onChangeText={setBackendUrl}
                        editable={isEditingUrl}
                        multiline
                        numberOfLines={2}
                        placeholder="https://your-backend.com"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            </View>
        </ScrollView>
    );
}
