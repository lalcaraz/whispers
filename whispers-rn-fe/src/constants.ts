/**
 * Application Constants
 */

export const DEFAULT_LOCALE = 'en';

// Backend Configuration
// Using localhost proxy (http://localhost:3001) to avoid SSL certificate issues on Android
// Run: node proxy-server.js && adb reverse tcp:3001 tcp:3001
// TODO: Replace with your backend URL
export const DEFAULT_BACKEND_URL = 'https://change-me-with-your-backend-url.com';

// TODO: Replace with your EAS Project ID
export const EAS_PROJECT_ID='change-me-to-your-project-id';


// Storage Keys
export const STORAGE_KEYS = {
    BACKEND_URL: 'backend_url',
    PUSH_TOKEN: 'push_token',
    LOCALE: 'locale',
    LAST_REGISTRATION_TIME: 'last_registration_time',
} as const;

// Network Configuration
export const NETWORK_CONFIG = {
    REQUEST_TIMEOUT: 30000, // 30 seconds
    POLLING_INTERVAL: 2000, // 2 seconds for message polling
    REGISTRATION_REFRESH_INTERVAL: 20 * 60 * 60 * 1000, // 20 hours (refresh before 24hr expiry)
} as const;

// Emergency Mode Configuration
export const EMERGENCY_CONFIG = {
    SHAKE_COUNT_THRESHOLD: 10,
    SHAKE_TIME_WINDOW: 3000, // 3 seconds
    COUNTDOWN_DURATION: 10, // 10 seconds
} as const;

// Database Configuration
export const DATABASE_CONFIG = {
    NAME: 'whispers.db',
    CURRENT_VERSION: 3,
} as const;
