/**
 * Application Constants
 */

export const DEFAULT_LOCALE = 'en';

// Backend relay URL. Operators set this per deployment. Users can override it at
// runtime in Profile > Backend URL (stored in secure storage). Must be HTTPS in
// production; the app talks to it over the signed /register, /send, /contacts API.
export const DEFAULT_BACKEND_URL = 'https://change-me-with-your-backend-url.example';

// Storage Keys
export const STORAGE_KEYS = {
    BACKEND_URL: 'backend_url',
    PUSH_TOKEN: 'push_token',
    LOCALE: 'locale',
    THEME: 'theme',
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
