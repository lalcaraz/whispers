# Whispers

A React Native mobile application built with Expo, featuring end-to-end encrypted messaging with Ed25519 cryptography, QR-based contact pairing, and local SQLite storage.

## Features

- **End-to-End Encryption**: X25519 ECDH key agreement + ChaCha20-Poly1305 AEAD cipher + Ed25519 signatures
- **QR Contact Pairing**: Scan QR codes containing JSON public keys (ed25519 + x25519) to establish secure conversations
- **Message Encryption**: ChaCha20-Poly1305 authenticated encryption with random nonces for each message
- **Digital Signatures**: Ed25519 signatures verify message authenticity and prevent tampering
- **Database Migrations**: Version-controlled schema migrations with PRAGMA user_version
- **Local SQLite Database**: Persistent storage with linked conversations and messages using expo-sqlite
- **React Navigation**: Type-safe screen navigation with native stack navigator
- **Modern Cryptography**: @noble/curves for X25519/Ed25519 (~394ms key generation) with hardware-backed secure storage
- **Emergency Mode**: 10-shake failsafe emergency data wipe with countdown
- **Profile Management**: User profile with key management, QR code display, key regeneration, and backend URL configuration
- **Relational Data**: Messages linked to conversations with CASCADE delete support and recipient public keys
- **Long Press to Delete**: 3-second long press on messages or conversations to delete
- **Internationalization**: Multi-language support (English, Spanish, German, Italian, Portuguese) with automatic device locale detection
- **Context-Based State Management**: Scoped state management per conversation using React Context
- **Safe Area Support**: Proper handling of device notches and safe areas
- **Screen Capture Prevention**: Security feature to prevent screenshots
- **Lazy Loading**: Optimized lists with FlatList performance optimizations
- **Push Notifications**: Firebase Cloud Messaging integration for message notifications
- **Backend Communication**: Configurable backend URL for message relay and push notifications

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── conversationsList/
│   ├── emergencyCountdown/  # Emergency mode countdown modal
│   ├── languageSelector/
│   ├── messageList/
│   ├── navBar/
│   └── qrScanner/       # QR code scanner for contact pairing
├── hooks/               # Custom React hooks with Context providers
│   ├── useBackend.tsx   # Backend API communication and push notifications
│   ├── useConversations.tsx # Conversations database & state management
│   ├── useMessages.tsx  # Messages database & state management (scoped per conversation)
│   ├── useNavBar.tsx    # Navigation bar configuration
│   ├── useShakeDetection.tsx # Accelerometer-based shake detection
│   └── useTranslation.tsx # Internationalization with device locale detection
├── locales/             # Translation dictionaries
│   ├── en.ts            # English translations
│   ├── es.ts            # Spanish translations
│   ├── de.ts            # German translations
│   ├── it.ts            # Italian translations
│   ├── pt.ts            # Portuguese translations
│   └── index.ts         # Locale registry with device detection
├── navigation/          # React Navigation configuration
│   └── index.tsx        # Navigation stack and type definitions
├── utils/               # Utility functions
│   ├── messages/        # Messages screen with encryption on send
    └── profile/         # User profile with keys, QR code, language selector, and backend URL config
    ├── conversations/   # Conversations list screen with QR scanner
    ├── debug/           # Debug screen
    ├── messages/        # Messages screen with encryption on send
    └── profile/         # User profile with keys and QR code
```

## Architecture Patterns

### Context-Based Hooks
All major state is managed through React Context providers:
- `ConversationsProvider` - Database operations and conversation state
- `MessagesProvider` - Database operations and message state
- `NavBarProvider` - Navigation bar configuration
- `TranslationProvider` - Language and translations
- `SafeAreaProvider` - Device safe area insets

### Component Structure
Components follow a consistent pattern:
- Main component in `index.tsx`
- Styles in separate `styles.ts` file
- Use path aliases (`@components`, `@hooks`, `@views`, `@locales`)

### Storage Architecture

The app uses a dual-storage approach for optimal performance and security:

**expo-sqlite** (Conversations & Messages):
- Full relational database with SQL queries
- Optimized for large datasets and complex relationships
- Supports foreign keys, CASCADE deletes, and joins
- Efficient pagination and filtering
- Stored in app's private directory (secure by default)

**expo-secure-store** (Cryptographic Keys):
- Device keychain (iOS) or KeyStore (Android)
- Hardware-backed encryption when available
- Perfect for small sensitive data (keys, tokens)
- Limited to 2KB per item

This separation ensures both security and performance: messages benefit from SQL capabilities while keys get maximum protection.

### Styling Convention
- All StyleSheet definitions are in separate `styles.ts` files
- Co-located with their components
- Use React Native's `StyleSheet.create()` for performance

## Key Technologies

- **React Native 0.81.5** - Mobile framework
- **Expo 54.0.33** - Development platform
- **TypeScript 5.9.3** - Type safety
- **expo-sqlite 15.0.11** - Local database with versioned migrations for messages and conversations
- **expo-secure-store 15.0.8** - Secure storage for cryptographic keys (hardware-backed)
- **expo-crypto 15.0.8** - Cryptographically secure random number generation and SHA-256 hashing
- **@noble/curves 2.0.1** - X25519 ECDH key agreement and Ed25519 digital signatures
- **@noble/ciphers** - ChaCha20-Poly1305 AEAD cipher for authenticated encryption
- **expo-camera 17.0.10** - QR code scanning for contact exchange
- **@react-navigation/native + native-stack** - Type-safe navigation
- **expo-localization** - Device locale detection for automatic language selection
- **react-native-safe-area-context 5.6.0** - Safe area handling
- **expo-screen-capture 8.0.9** - Screenshot prevention
- **@react-native-firebase/app** - Firebase integration for push notifications
- **expo-notifications** - Push notification handling
- **axios** - HTTP client for backend API communication
- **expo-clipboard 8.0.8** - Clipboard operations

## Development

### Prerequisites
- Node.js
- Expo CLI
- iOS Simulator or Android Emulator

### Installation
```bash
npm install
```

### Running the App
```bash
# Start Metro bundler
npm start

# Run on specific platform
npm run ios
npm run android
npm run web
```


## API Usage

### Using the Conversations Hook
```tsx
import useConversations from '@hooks/useConversations';

const { conversations, loading, createConversation, deleteConversation } = useConversations();

// Create a conversation with recipient public key (JSON format)
await createConversation("Contact Name", "{\"ed25519\":\"...\",\"x25519\":\"...\"}");

// Update a conversation
await updateConversation(conversationId, "Updated Title");

// Delete a conversation (CASCADE deletes all messages)
await deleteConversation(conversationId);

// Delete all conversations
await deleteAllConversations();
```

### Using the Messages Hook (Scoped per Conversation)
```tsx
import { MessagesProvider } from '@hooks/useMessages';
import useMessages from '@hooks/useMessages';

// Wrap your component with MessagesProvider
function MessagesScreen({ conversationId }) {
  return (
    <MessagesProvider conversationId={conversationId}>
      <MessagesContent />
    </MessagesProvider>
  );
}

function MessagesContent() {
  const { items, loading, createItem, deleteItem } = useMessages();

  // Create a message (requires conversationId)
  await createItem("Hello world", conversationId);

  // Delete a message
  await deleteItem(messageId);

  // Delete all messages in this conversation
  await deleteAllItems();
}
```

### Using Database Utilities
```tsx
import { initializeDatabase, deleteAllData, resetDatabase, getDatabaseStats } from '@/utils/database';

// Initialize database (called automatically on app start)
await initializeDatabase();

// Delete all data (messages and conversations)
await deleteAllData();

// Complete database reset (drops and recreates tables)
await resetDatabase();

// Get database statistics
const stats = await getDatabaseStats();
console.log(stats); // { messages: 5, conversations: 2 }
```

### Profile Management
```tsx
// Navigate to Profile screen from Conversations view
navigation.navigate('Profile');

// Features: and re-registers with backend)
// - Language selector with 5 languages (English, Spanish, German, Italian, Portuguese)
// - Backend URL configuration for message relay server
// - Long press Regenerate button to reset database
// - Display QR code of public keys (JSON format with ed25519 and x25519)
// - Copy public keys to clipboard
// - View truncated private keys (security)
// - Regenerate key pair (deletes all conversations/messages, ~394ms)
```

## Cryptography Implementation

### Key Generation
```tsx
import { getKeys, regenerateKeys, clearKeys } from '@/utils/keys';

// Get or generate keys (Ed25519 + X25519)
const { publicKey, privateKey } = await getKeys();
// Returns JSON string: {\"ed25519\":\"...\",\"x25519\":\"...\"}
// Each key: 64-character hex string (32 bytes)

// Regenerate keys (~394ms)
const newKeys = await regenerateKeys();

// Clear keys (emergency wipe)
await clearKeys();
```

### Message Encryption
```tsx
import { encryptMessage, decryptMessage } from '@/utils/keys';

// Encrypt a message for a recipient
const encryptedData = await encryptMessage(
    \"Hello, secure world!\",
    recipientPublicKey, // JSON: {ed25519, x25519}
    conversationId
);
// Returns: { ciphertext, nonce, signature }

// Decrypt a received message
const decrypted = await decryptMessage(
    encryptedMessage,
    senderPublicKey // JSON: {ed25519, x25519}
);
```

### Cryptography Details

**Key Generation** (~394ms):
- Seed: 32 bytes cryptographically secure random via expo-crypto
- Ed25519 keys: Derived from seed using @noble/curves/ed25519 (signatures)
- X25519 keys: Derived from same seed using @noble/curves/x25519 (encryption)
- Storage: expo-secure-store with hardware-backed encryption (iOS Keychain/Android KeyStore)
- Format: JSON with separate ed25519 and x25519 public keys

**Encryption Algorithm** (95/100 security score):
- ECDH: X25519 key agreement for shared secret
- Cipher: ChaCha20-Poly1305 AEAD (authenticated encryption with associated data)
- Nonce: 12 bytes random per message (prevents replay attacks)
- Signatures: Ed25519 for message authenticity and non-repudiation
- Performance: ~640x faster than RSA-2048 key generation

**Message Encryption Flow**:
1. Derive shared secret via X25519 ECDH (senderX25519Private + recipientX25519Public)
2. Generate random 12-byte nonce using crypto.getRandomValues
3. Encrypt message with ChaCha20-Poly1305 using shared secret and nonce
4. Sign encrypted message with Ed25519 for authenticity
5. Return: { ciphertext, nonce, signature }

**Message Decryption Flow**:
1. Verify Ed25519 signature first (fail fast if tampered)
2. Derive same shared secret via X25519 ECDH
3. Decrypt ciphertext with ChaCha20-Poly1305 using shared secret and nonce
4. Poly1305 MAC automatically verifies integrity
5. Return decrypted plaintext

**Backend API Authentication**:
- All /send requests require Ed25519 signature authentication
- Request includes timestamp (milliseconds) and signature fields
- Signature generation: `sign(timestamp + destination + encryptedMessage)` using Ed25519 private key
- Signature must be exactly 128 hex characters (64 bytes)
- Timestamp must be within 5 minutes of server time (replay attack prevention)
- Error responses:
  - 401: Signature invalid or expired
  - 400: Signature format incorrect
  - 404: Recipient not registered
  - 413: Payload too large (exceeds 10KB limit)
  - 429: Rate limit exceeded (100 requests per 15 minutes per IP)

**Backend Rate Limiting**:
- Limit: 100 requests per 15 minutes per IP address
- Applied to `/send` and `/register` endpoints
- Returns 429 status code when limit exceeded
- App displays user-friendly error message: "Too many requests. Please wait a few minutes and try again."

**Backend Payload Limits**:
- Maximum request size: 10KB (includes encrypted message + metadata)
- Returns 413 status code when limit exceeded
- App displays: "Message too large. Maximum size is 10KB."

**Backend Registration Lifecycle**:
- Device registration expires after 24 hours on backend
- App automatically refreshes registration every 20 hours (proactive, before expiry)
- Registration timestamp stored in secure storage for tracking
- On app launch, checks if registration is older than 20 hours and auto-renews
- If message send fails with 401/403 (expired registration), automatically re-registers and retries
- Prevents message delivery failures from stale registrations

**QR Contact Pairing**:
- Plus button in Conversations view opens QR scanner
- Scans JSON format: `{\"ed25519\":\"...\",\"x25519\":\"...\"}`
- Validates both public keys are 64-character hex strings
- Prompts for contact name after successful scan
- Creates conversation with recipient public keys for encrypted messaging

**Security Properties**:
- Forward secrecy: Compromised long-term keys don't decrypt past messages (with key rotation)
- Authentication: Ed25519 signatures prevent impersonation
- Integrity: Poly1305 MAC detects tampering
- Confidentiality: ChaCha20 encryption prevents eavesdropping
- Replay protection: Unique nonces prevent message replay attacks

**Polyfills for React Native**:
- `crypto.getRandomValues`: Bridges expo-crypto to @noble/curves
- No native modules required: Pure JavaScript implementation

## Database Schema

### Conversations Table
```sql
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    recipientPublicKey TEXT NOT NULL,
    lastMessage TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);
```

### Messages Table
```tsx
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL,
    conversationId INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
);
```

**Database Migrations**:
- Version-controlled schema using `PRAGMA user_version`
- Current version: 2
- Migration 1: Initial schema (conversations + messages tables)
- Migration 2: Added `recipientPublicKey` column to conversations
- Migrations run automatically on app launch
- Safe for existing databases (checks column existence before ALTER TABLE)

**Note**: Foreign keys are enabled via `PRAGMA foreign_keys = ON;` ensuring CASCADE deletes work properly.

## User Interactions
- Version-controlled schema using `PRAGMA user_version`
- Current version: 2
- Migration 1: Initial schema (conversations + messages tables)
- Migration 2: Added `recipientPublicKey` column to conversations
- Migrations run automatically on app launch
- Safe for existing databases (checks column existence before ALTER TABLE)

**Note**: Foreign keys are enabled via `PRAGMA foreign_keys = ON;` ensuring CASCADE deletes work properly.

## User Interactions

### Long Press to Delete
- **Messages**: Long press any message for 3 seconds to show delete confirmation
- **Conversations**: Long press any conversation for 3 seconds to delete it and all its messages

### Navigation Flow
1. Conversations list screen (default)
2. Tap conversation → Navigate to Messages screen
3. Tap "+" button → QR scanner to add new contact
4. Tap profile icon (👤) → Navigate to Profile screen
5. Back button returns to previous screen

### Emergency Mode
- **Shake Detection**: Shake your device 10 times within 3 seconds to trigger emergency mode
- **Failsafe Protection**: Requires multiple rapid shakes to prevent accidental activation
- **Countdown**: 5-second countdown with visual animation
- **Cancel Option**: Tap cancel button to abort emergency procedure
- **Data Wipe**: When countdown completes, all conversations, messages, and keys are deleted
- **Available Anywhere**: Works across all screens in the app
- **Auto-Reset**: Shake counter resets if 3 seconds pass between shakes

## Security Features

- **End-to-End Encryption**: X25519 ECDH + ChaCha20-Poly1305 AEAD + Ed25519 signatures (95/100 security score)
- **Modern Cryptography**: @noble/curves for elliptic curve operations (~394ms key generation)
- **Hardware-Backed Encryption**: Keys stored in device keychain (iOS) or KeyStore (Android)
- **Replay Protection**: Unique random nonces for each message prevent replay attacks
- **Message Authentication**: Ed25519 signatures verify sender identity and detect tampering
- **Authenticated Encryption**: ChaCha20-Poly1305 AEAD provides both confidentiality and integrity
- **Screen Capture Prevention**: Active on all screens to prevent screenshots
- **Emergency Data Wipe**: 10-shake failsafe activation with 5-second countdown
- **Chat-Style Messages**: Distinct styling for local (blue, right-aligned) vs incoming (gray, left-aligned) messages
- **Real-Time Updates**: Messages poll every 2 seconds when conversation is active
- **Dual Storage Architecture**: SQLite for data, Secure Store for keys
- **Private Key Protection**: Private keys are truncated and non-copyable in UI
- **Local-Only Storage**: No external APIs, all data stored in app's private directory
- **Automatic Initialization**: Database tables created securely on first launch
- **Foreign Key Constraints**: Ensures referential integrity and cascade deletes

## Path Aliases

The project uses TypeScript path aliases for cleaner imports:
- `@hooks/*` → `src/hooks/*`
- `@components/*` → `src/components/*`
- `@views/*` → `src/views/*`
- `@locales/*` → `src/locales/*`
- `@utils/*` → `src/utils/*`

## Internationalization

**Supported Languages**:
- English (`en`)
- Spanish (`es`)
- German (`de`)
- Italian (`it`)
- Portuguese (`pt`)

**How it Works**:
1. On first launch, app detects device language using `expo-localization`
2. If device language is supported, it's used as default
3. Falls back to English for unsupported languages
4. User can manually change language in Profile screen
5. Language preference is saved in secure storage and persists across app restarts

**Adding a New Language**:
1. Create new file in `src/locales/` (e.g., `fr.ts` for French)
2. Import `Translation` type from `en.ts`
3. Implement all translation keys (TypeScript ensures completeness)
4. Add locale to `locales` object in `src/locales/index.ts`
5. Add locale name to `localeNames` object
6. Update `Locale` type to include new language code

Example:
```tsx
// src/locales/fr.ts
import { Translation } from './en';

export const fr: Translation = {
  common: {
    loading: 'Chargement...',
    error: 'Erreur',
    // ... all other keys
  },
  // ... all other sections
};

// src/locales/index.ts
import { fr } from './fr';

export type Locale = 'en' | 'es' | 'de' | 'it' | 'pt' | 'fr';

export const locales: Record<Locale, typeof en> = {
  en, es, de, it, pt, fr,
};

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  fr: 'Français',
};
```file)

## Adding Translations

1. Add keys to `src/locales/en.ts`
2. Add translations to other locale files (e.g., `es.ts`)
3. TypeScript ensures all locales match the English structure
4. Use via `t.category.key` in components
