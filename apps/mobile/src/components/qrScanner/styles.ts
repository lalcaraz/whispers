import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

// The live-camera surfaces stay black in every theme; the post-scan name form
// follows the theme.
export const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
      backgroundColor: c.danger,
      padding: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    closeButtonText: {
      color: c.onDanger,
      fontSize: 18,
      fontWeight: '600',
    },
    nameInputContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      backgroundColor: c.screen,
    },
    nameInputTitle: {
      color: c.textPrimary,
      fontSize: 24,
      fontWeight: '600',
      marginBottom: 16,
    },
    scannedKeyPreview: {
      color: c.textMuted,
      fontSize: 14,
      fontFamily: 'monospace',
      marginBottom: 32,
    },
    nameInput: {
      width: '100%',
      backgroundColor: c.surface,
      color: c.textPrimary,
      padding: 16,
      borderRadius: 8,
      fontSize: 18,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: c.border,
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
      backgroundColor: c.accent,
    },
    cancelButton: {
      backgroundColor: c.textMuted,
    },
    buttonText: {
      color: c.onAccent,
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
