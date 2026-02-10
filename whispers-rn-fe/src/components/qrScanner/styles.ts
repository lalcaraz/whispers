import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: 40,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        alignItems: 'center',
    },
    overlayText: {
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
    },
    closeButton: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        backgroundColor: '#ff3b30',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    nameInputContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#000',
    },
    nameInputTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '600',
        marginBottom: 16,
    },
    scannedKeyPreview: {
        color: '#888',
        fontSize: 14,
        fontFamily: 'monospace',
        marginBottom: 32,
    },
    nameInput: {
        width: '100%',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 8,
        fontSize: 18,
        marginBottom: 24,
    },
    buttonRow: {
        width: '100%',
        gap: 12,
    },
    button: {
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 12,
    },
    createButton: {
        backgroundColor: '#007AFF',
    },
    cancelButton: {
        backgroundColor: '#8E8E93',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    permissionText: {
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 32,
    },
});
