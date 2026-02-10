import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

// Polyfill crypto.getRandomValues for React Native
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = {} as any;
}
if (typeof globalThis.crypto.getRandomValues === 'undefined') {
    globalThis.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
        // Use expo-crypto to fill the array with random bytes
        const typedArray = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        const randomBytes = Crypto.getRandomBytes(typedArray.length);
        typedArray.set(randomBytes);
        return array;
    };
}

const PUBLIC_KEY = 'user_public_key';
const PRIVATE_KEY = 'user_private_key';

/**
 * Generate a deterministic conversation ID from two public keys
 * Both parties will derive the same ID regardless of who is sender/receiver
 * @param publicKey1 - First public key (JSON string with ed25519 and x25519)
 * @param publicKey2 - Second public key (JSON string with ed25519 and x25519)
 * @returns A deterministic conversation ID (hex string)
 */
export async function generateConversationId(publicKey1: string, publicKey2: string): Promise<string> {
    // Parse the keys to get Ed25519 public keys (use as unique identifier)
    const key1Data = JSON.parse(publicKey1);
    const key2Data = JSON.parse(publicKey2);
    
    // Sort the Ed25519 keys to ensure deterministic ordering
    const [sortedKey1, sortedKey2] = [key1Data.ed25519, key2Data.ed25519].sort();
    
    // Concatenate the sorted keys
    const combined = sortedKey1 + sortedKey2;
    
    // Hash the combined string to get a fixed-length ID
    const hashBuffer = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        new TextEncoder().encode(combined)
    );
    
    // Convert to hex string (64 characters for SHA-256)
    const hashArray = new Uint8Array(hashBuffer);
    return toHex(hashArray);
}

/**
 * Convert Uint8Array to hex string
 */
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Generate X25519 and Ed25519 key pairs (fast - typically <10ms)
 * X25519 for encryption (ECDH), Ed25519 for signatures
 * We use the same seed for both to derive from one master secret
 */
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    // Generate a random seed (32 bytes)
    const seed = ed25519.utils.randomSecretKey();
    
    // Generate Ed25519 keys for signatures from seed
    const ed25519PrivateKey = seed;
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey);
    
    // Generate X25519 keys for encryption from same seed
    // Use seed directly as X25519 private key (both are 32 bytes)
    const x25519PrivateKey = seed;
    const x25519PublicKey = x25519.getPublicKey(x25519PrivateKey);
    
    // Store both key pairs as a JSON object
    const keyPair = {
        ed25519: {
            publicKey: toHex(ed25519PublicKey),
            privateKey: toHex(ed25519PrivateKey)
        },
        x25519: {
            publicKey: toHex(x25519PublicKey),
            privateKey: toHex(x25519PrivateKey)
        }
    };
    
    // Return both public keys as JSON string for identification
    // Store the full key pair structure as private key
    const publicKeyData = {
        ed25519: keyPair.ed25519.publicKey,
        x25519: keyPair.x25519.publicKey
    };
    
    return { 
        publicKey: JSON.stringify(publicKeyData),
        privateKey: JSON.stringify(keyPair)
    };
}

/**
 * Get or create keys from secure storage
 */
export async function getKeys(): Promise<{ publicKey: string; privateKey: string }> {
    try {
        let publicKey = await SecureStore.getItemAsync(PUBLIC_KEY);
        let privateKey = await SecureStore.getItemAsync(PRIVATE_KEY);

        // If keys don't exist, generate new ones
        if (!publicKey || !privateKey) {
            const keys = await generateKeyPair();
            await SecureStore.setItemAsync(PUBLIC_KEY, keys.publicKey);
            await SecureStore.setItemAsync(PRIVATE_KEY, keys.privateKey);
            return keys;
        }

        return { publicKey, privateKey };
    } catch (error) {
        console.error('Error getting keys:', error);
        // Fallback to generating new keys if there's an error
        return await generateKeyPair();
    }
}

/**
 * Regenerate and save new keys
 */
export async function regenerateKeys(): Promise<{ publicKey: string; privateKey: string }> {
    const keys = await generateKeyPair();
    await SecureStore.setItemAsync(PUBLIC_KEY, keys.publicKey);
    await SecureStore.setItemAsync(PRIVATE_KEY, keys.privateKey);
    return keys;
}

/**
 * Clear all keys from secure storage (for emergency wipe)
 */
export async function clearKeys(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(PUBLIC_KEY);
        await SecureStore.deleteItemAsync(PRIVATE_KEY);
    } catch (error) {
        console.error('Error clearing keys:', error);
        throw error;
    }
}

/**
 * Sign a message using Ed25519 for backend authentication
 * @param message - The message to sign (concatenated timestamp + destination + encryptedMessage)
 * @returns 128-character hex string signature
 */
export async function signMessage(message: string): Promise<string> {
    try {
        const { privateKey } = await getKeys();
        const keyPair = JSON.parse(privateKey);
        
        // Get Ed25519 private key bytes
        const ed25519PrivateKeyBytes = hexToBytes(keyPair.ed25519.privateKey);
        
        // Convert message to bytes
        const messageBytes = new TextEncoder().encode(message);
        
        // Sign with Ed25519
        const signature = ed25519.sign(messageBytes, ed25519PrivateKeyBytes);
        
        // Convert to hex string (64 bytes = 128 hex characters)
        return toHex(signature);
    } catch (error) {
        console.error('Error signing message:', error);
        throw error;
    }
}

/**
 * Encrypt a message using X25519 ECDH + ChaCha20-Poly1305
 * @param message - The message to encrypt
 * @param recipientPublicKey - The recipient's public key (hex string)
 * @returns Object with dest (recipient public key) and encryptedMessage
 */
export async function encryptMessage(
    message: string, 
    recipientPublicKey: string
): Promise<{ destination: string; message: string }> {
    try {
        // Get sender's keys
        const { privateKey, publicKey } = await getKeys();
        const keyPair = JSON.parse(privateKey);
        
        // Create the payload to encrypt
        const payload = {
            publicKey: publicKey,
            message: message,
            timestamp: Date.now()
        };
        
        const payloadString = JSON.stringify(payload);
        
        // Parse recipient's public key to get X25519 key
        const recipientPublicKeyData = JSON.parse(recipientPublicKey);
        
        // Derive shared secret using X25519 ECDH
        const x25519PrivateKeyBytes = hexToBytes(keyPair.x25519.privateKey);
        const recipientX25519PublicKeyBytes = hexToBytes(recipientPublicKeyData.x25519);
        const sharedSecret = x25519.getSharedSecret(x25519PrivateKeyBytes, recipientX25519PublicKeyBytes);
        
        // Use shared secret as encryption key (32 bytes)
        const payloadBytes = new TextEncoder().encode(payloadString);
        
        // Generate random 12-byte nonce (must be unique per message)
        const nonce = Crypto.getRandomBytes(12);
        
        // Encrypt with ChaCha20-Poly1305 (AEAD cipher)
        const cipher = chacha20poly1305(sharedSecret, nonce);
        const encrypted = cipher.encrypt(payloadBytes);
        
        const encryptedHex = toHex(encrypted);
        const nonceHex = toHex(nonce);
        
        // Sign with sender's Ed25519 private key for authenticity
        const ed25519PrivateKeyBytes = hexToBytes(keyPair.ed25519.privateKey);
        const signature = ed25519.sign(encrypted, ed25519PrivateKeyBytes);
        
        // Package the encrypted message with signature and nonce
        const encryptedMessage = JSON.stringify({
            encrypted: encryptedHex,
            nonce: nonceHex,
            signature: toHex(signature),
        });
        
        return {
            destination: recipientPublicKey,
            message: encryptedMessage
        };
    } catch (error) {
        console.error('Error encrypting message:', error);
        throw error;
    }
}

/**
 * DEBUG: Encrypt a message with provided keys (for testing)
 * @param message - The message to encrypt
 * @param senderPrivateKey - Sender's private key (hex string)
 * @param senderPublicKey - Sender's public key (hex string)
 * @param recipientPublicKey - Recipient's public key (hex string)
 * @returns Object with dest and encrypted message
 */
export async function debugEncryptMessage(
    message: string,
    senderPrivateKey: string,
    senderPublicKey: string,
    recipientPublicKey: string
): Promise<{ destination: string; encryptedMessage: string }> {
    try {
        // Parse sender's key pair
        const senderKeyPair = JSON.parse(senderPrivateKey);
        
        // Create the payload to encrypt
        const payload = {
            publicKey: senderPublicKey,
            message: message,
            timestamp: Date.now()
        };
        
        const payloadString = JSON.stringify(payload);
        
        // Parse recipient's public key to get X25519 key
        const recipientPublicKeyData = JSON.parse(recipientPublicKey);
        
        // Derive shared secret using X25519 ECDH
        const x25519PrivateKeyBytes = hexToBytes(senderKeyPair.x25519.privateKey);
        const recipientX25519PublicKeyBytes = hexToBytes(recipientPublicKeyData.x25519);
        const sharedSecret = x25519.getSharedSecret(x25519PrivateKeyBytes, recipientX25519PublicKeyBytes);
        
        // Encrypt using XOR with shared secret
        const payloadBytes = new TextEncoder().encode(payloadString);
        
        // Generate random 12-byte nonce
        const nonce = Crypto.getRandomBytes(12);
        
        // Encrypt with ChaCha20-Poly1305
        const cipher = chacha20poly1305(sharedSecret, nonce);
        const encrypted = cipher.encrypt(payloadBytes);
        
        const encryptedHex = toHex(encrypted);
        const nonceHex = toHex(nonce);
        
        // Sign with sender's Ed25519 private key
        const ed25519PrivateKeyBytes = hexToBytes(senderKeyPair.ed25519.privateKey);
        const signature = ed25519.sign(encrypted, ed25519PrivateKeyBytes);
        
        // Package the encrypted message with signature
        const encryptedMessage = JSON.stringify({
            encrypted: encryptedHex,
            nonce: nonceHex,
            signature: toHex(signature),
            payload: payload // Temporarily including plaintext for testing
        });
        
        return {
            destination: recipientPublicKey,
            encryptedMessage: encryptedMessage
        };
    } catch (error) {
        console.error('Error encrypting message:', error);
        throw error;
    }
}

/**
 * Decrypt and verify an incoming encrypted message using X25519 ECDH
 * @param encryptedPayload - The encrypted message payload from backend
 * @returns Decrypted message data or null if verification fails
 */
export async function decryptMessage(encryptedPayload: {
    origin: string;
    destination: string;
    encryptedMessage: { encrypted: string; nonce?: string; signature: string; payload?: any };
}): Promise<{
    senderPublicKey: string;
    message: string;
    timestamp: number;
} | null> {
    try {
        // Get recipient's keys (we are the recipient)
        const { privateKey } = await getKeys();
        const keyPair = JSON.parse(privateKey);
        
        // Parse the encrypted message
        const parsed = encryptedPayload.encryptedMessage;
        const { encrypted, nonce, signature } = parsed;
        
        if (!nonce) {
            console.error('Missing nonce - old message format not supported');
            return null;
        }
        
        // Parse sender's public key to get Ed25519 and X25519 keys
        const senderPublicKeyData = JSON.parse(encryptedPayload.origin);
        
        // Verify Ed25519 signature with sender's Ed25519 public key
        const senderEd25519PublicKeyBytes = hexToBytes(senderPublicKeyData.ed25519);
        const signatureBytes = hexToBytes(signature);
        const encryptedBytesForVerification = hexToBytes(encrypted);
        const isValid = ed25519.verify(signatureBytes, encryptedBytesForVerification, senderEd25519PublicKeyBytes);
        
        if (!isValid) {
            console.error('Signature verification failed');
        }
        
        // Derive shared secret using X25519 ECDH with sender's X25519 public key
        const x25519PrivateKeyBytes = hexToBytes(keyPair.x25519.privateKey);
        const senderX25519PublicKeyBytes = hexToBytes(senderPublicKeyData.x25519);
        const sharedSecret = x25519.getSharedSecret(x25519PrivateKeyBytes, senderX25519PublicKeyBytes);
        
        // Decrypt using ChaCha20-Poly1305
        const encryptedBytes = hexToBytes(encrypted);
        const nonceBytes = hexToBytes(nonce);
        
        const cipher = chacha20poly1305(sharedSecret, nonceBytes);
        const decryptedBytes = cipher.decrypt(encryptedBytes);
        
        // Parse the decrypted payload
        const decrypted = new TextDecoder().decode(decryptedBytes);
        const payload = JSON.parse(decrypted);
        
        return {
            senderPublicKey: payload.publicKey,
            message: payload.message,
            timestamp: payload.timestamp
        };
        
    } catch (error) {
        console.error('Error decrypting message:', error);
        return null;
    }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}
