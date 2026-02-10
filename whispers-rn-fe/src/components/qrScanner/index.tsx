import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Alert, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { styles } from './styles';

type QRScannerProps = {
    visible: boolean;
    onClose: () => void;
    onScanComplete: (publicKey: string, conversationName: string) => void;
};

export default function QRScanner({ visible, onClose, onScanComplete }: QRScannerProps) {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [scannedData, setScannedData] = useState<string | null>(null);
    const [conversationName, setConversationName] = useState('');

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;
        
        setScanned(true);
        setScannedData(data);
        
        // Try to parse as JSON (new format with ed25519 and x25519 keys)
        try {
            const parsed = JSON.parse(data);
            if (!parsed.ed25519 || !parsed.x25519) {
                throw new Error('Missing required keys');
            }
            // Validate that both keys are 64 hex characters
            if (!/^[a-fA-F0-9]{64}$/.test(parsed.ed25519) || !/^[a-fA-F0-9]{64}$/.test(parsed.x25519)) {
                throw new Error('Invalid key format');
            }
            // Valid JSON format with both keys
        } catch (error) {
            // Check if it's old format (single 64 hex string)
            if (!/^[a-fA-F0-9]{64}$/.test(data)) {
                Alert.alert(
                    'Invalid QR Code',
                    'The scanned QR code does not contain a valid public key. Please try again.',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                setScanned(false);
                                setScannedData(null);
                            }
                        }
                    ]
                );
            }
            // Old format is still valid
        }
    };

    const handleCreateConversation = () => {
        if (!conversationName.trim()) {
            Alert.alert('Name Required', 'Please enter a name for this conversation.');
            return;
        }

        if (scannedData) {
            onScanComplete(scannedData, conversationName.trim());
            handleClose();
        }
    };

    const handleClose = () => {
        setScanned(false);
        setScannedData(null);
        setConversationName('');
        onClose();
    };

    if (!permission) {
        return null;
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
                <View style={styles.container}>
                    <View style={styles.permissionContainer}>
                        <Text style={styles.permissionText}>Camera permission is required to scan QR codes</Text>
                        <TouchableOpacity style={styles.button} onPress={requestPermission}>
                            <Text style={styles.buttonText}>Grant Permission</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleClose}>
                            <Text style={styles.buttonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
            <View style={styles.container}>
                {!scannedData ? (
                    <>
                        <CameraView
                            style={styles.camera}
                            facing="back"
                            onBarcodeScanned={handleBarCodeScanned}
                            barcodeScannerSettings={{
                                barcodeTypes: ['qr'],
                            }}
                        />
                        <View style={styles.overlay}>
                            <Text style={styles.overlayText}>Scan a QR code containing a public key</Text>
                        </View>
                        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                            <Text style={styles.closeButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <View style={styles.nameInputContainer}>
                        <Text style={styles.nameInputTitle}>Public Key Scanned!</Text>
                        <Text style={styles.scannedKeyPreview}>
                            {scannedData.substring(0, 16)}...{scannedData.substring(48)}
                        </Text>
                        <TextInput
                            style={styles.nameInput}
                            placeholder="Enter conversation name"
                            value={conversationName}
                            onChangeText={setConversationName}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={handleCreateConversation}
                        />
                        <View style={styles.buttonRow}>
                            <TouchableOpacity 
                                style={[styles.button, styles.createButton]} 
                                onPress={handleCreateConversation}
                            >
                                <Text style={styles.buttonText}>Create Conversation</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.button, styles.cancelButton]} 
                                onPress={handleClose}
                            >
                                <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
}
