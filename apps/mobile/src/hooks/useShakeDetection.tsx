import { useEffect, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

const SHAKE_THRESHOLD = 2.5;

export default function useShakeDetection(onShake: () => void) {
    const [subscription, setSubscription] = useState<any>(null);

    useEffect(() => {
        const subscribe = () => {
            setSubscription(
                Accelerometer.addListener(accelerometerData => {
                    const { x, y, z } = accelerometerData;
                    const acceleration = Math.sqrt(x * x + y * y + z * z);

                    if (acceleration > SHAKE_THRESHOLD) {
                        onShake();
                    }
                })
            );
        };

        subscribe();
        Accelerometer.setUpdateInterval(100);

        return () => {
            subscription?.remove();
            setSubscription(null);
        };
    }, [onShake]);
}
