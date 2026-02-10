import { Modal, View, Text, TouchableOpacity, Animated } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import useTranslation from '@hooks/useTranslation';
import { styles } from './styles';

type EmergencyCountdownProps = {
    visible: boolean;
    onCancel: () => void;
    onComplete: () => void;
};

export default function EmergencyCountdown({ visible, onCancel, onComplete }: EmergencyCountdownProps) {
    const { t } = useTranslation();
    const [countdown, setCountdown] = useState(5);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!visible) {
            setCountdown(5);
            return;
        }

        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    onComplete();
                    return 0;
                }
                return prev - 1;
            });

            // Pulse animation
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 1.2,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }, 1000);

        return () => clearInterval(interval);
    }, [visible, onComplete]);

    if (!visible) return null;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <Text style={styles.title}>
                        {t.emergency?.title || '⚠️ Emergency Mode'}
                    </Text>
                    
                    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                        <Text style={styles.countdown}>{countdown}</Text>
                    </Animated.View>

                    <Text style={styles.message}>
                        {t.emergency?.message || 'All data will be erased'}
                    </Text>

                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={onCancel}
                    >
                        <Text style={styles.cancelButtonText}>
                            {t.common?.cancel || 'Cancel'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
