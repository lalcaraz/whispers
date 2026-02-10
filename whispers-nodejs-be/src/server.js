require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const nacl = require('tweetnacl');
const { Expo } = require('expo-server-sdk');
const { initializeDatabase } = require('./db');

const app = express();
const expo = new Expo();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/whispers.db';
const TIMESTAMP_TOLERANCE = parseInt(process.env.TIMESTAMP_TOLERANCE) || 300000; // 5 minutes default
const CLEANUP_KEY = process.env.CLEANUP_KEY || 'change-me-in-production';

// Initialize database
const db = initializeDatabase(DB_PATH);

// Validation helpers
function isValidRecipientId(id) {
  return typeof id === 'string' && 
         id.length >= 10 && 
         id.length <= 128 && 
         /^[a-zA-Z0-9_-]+$/.test(id);
}

function isValidKeyObject(keyObj) {
  if (typeof keyObj !== 'string' || keyObj.length > 500) return false;
  try {
    const parsed = JSON.parse(keyObj);
    // Must have ed25519 and x25519 keys
    if (!parsed.ed25519 || !parsed.x25519) return false;
    // Both must be hex strings (64 or 66 characters with optional 0x prefix)
    const hexPattern = /^(0x)?[a-f0-9]{64}$/i;
    return typeof parsed.ed25519 === 'string' && hexPattern.test(parsed.ed25519) &&
           typeof parsed.x25519 === 'string' && hexPattern.test(parsed.x25519);
  } catch {
    return false;
  }
}

function isValidText(text, maxLength = 1000) {
  return typeof text === 'string' && 
         text.length > 0 && 
         text.length <= maxLength;
}

function isValidEncryptedMessage(msg) {
  if (typeof msg !== 'string' || msg.length > 5000) return false;
  try {
    const parsed = JSON.parse(msg);
    // Must have all three fields and they must be hex strings
    if (!parsed.encrypted || !parsed.signature || !parsed.nonce) return false;
    const hexPattern = /^[a-f0-9]+$/i;
    return typeof parsed.encrypted === 'string' && hexPattern.test(parsed.encrypted) &&
           typeof parsed.signature === 'string' && hexPattern.test(parsed.signature) &&
           typeof parsed.nonce === 'string' && hexPattern.test(parsed.nonce);
  } catch {
    return false;
  }
}

function verifyRequestSignature(origin, timestamp, destination, encryptedMessage, signature) {
  try {
    // Validate timestamp is recent (prevent replay attacks)
    const now = Date.now();
    if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE) {
      console.log('Timestamp validation failed:', { now, timestamp, diff: Math.abs(now - timestamp) });
      return false;
    }

    // Reconstruct the signed message (must match mobile app order)
    const message = `${timestamp}${destination}${encryptedMessage}`;
    const messageBytes = Buffer.from(message, 'utf8');
    const signatureBytes = Buffer.from(signature, 'hex');
    
    // Extract public key from origin
    const originKeys = JSON.parse(origin);
    const publicKeyHex = originKeys.ed25519.replace(/^0x/, '');
    const publicKey = Buffer.from(publicKeyHex, 'hex');
    
    // Verify signature using ed25519
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
    
    if (!isValid) {
      console.log('Signature verification failed');
    }
    
    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error.message);
    return false;
  }
}

function sanitizeForLog(data) {
  const sanitized = { ...data };
  
  // Sanitize key objects (recipientId, destination, origin)
  ['recipientId', 'destination', 'origin'].forEach(field => {
    if (sanitized[field]) {
      try {
        const keys = JSON.parse(sanitized[field]);
        sanitized[field] = {
          ed25519: keys.ed25519 ? `${keys.ed25519.substring(0, 8)}...${keys.ed25519.slice(-8)}` : undefined,
          x25519: keys.x25519 ? `${keys.x25519.substring(0, 8)}...${keys.x25519.slice(-8)}` : undefined
        };
      } catch {
        sanitized[field] = '[invalid-format]';
      }
    }
  });
  
  // Sanitize Expo push token
  if (sanitized.expoPushToken) {
    const token = sanitized.expoPushToken;
    sanitized.expoPushToken = token.length > 30 
      ? `${token.substring(0, 20)}...${token.slice(-10)}`
      : '[token]';
  }
  
  // Sanitize encrypted message
  if (sanitized.encryptedMessage) {
    try {
      const msg = JSON.parse(sanitized.encryptedMessage);
      sanitized.encryptedMessage = {
        encrypted: `[${msg.encrypted?.length || 0} chars]`,
        nonce: msg.nonce ? `${msg.nonce.substring(0, 8)}...` : undefined,
        signature: msg.signature ? `${msg.signature.substring(0, 8)}...` : undefined
      };
    } catch {
      sanitized.encryptedMessage = '[invalid-format]';
    }
  }
  
  // Sanitize request signature
  if (sanitized.signature) {
    sanitized.signature = `${sanitized.signature.substring(0, 8)}...${sanitized.signature.slice(-8)}`;
  }
  
  return sanitized;
}

// Middleware
app.set('trust proxy', 1); // Trust first proxy (ngrok, nginx, Cloudflare)
app.use(express.json({ limit: '10kb' }));

// Rate limiting - 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to sensitive endpoints
app.use('/send', apiLimiter);
app.use('/register', apiLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register/update recipient with Expo push token
app.post('/register', (req, res) => {
  const { recipientId, expoPushToken } = req.body;
  console.log('Register request:', sanitizeForLog(req.body));

  if (!recipientId || !expoPushToken) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: recipientId, expoPushToken'
    });
  }

  // Validate recipient ID format (now expects key object like destination/origin)
  if (!isValidKeyObject(recipientId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid recipientId: must be JSON with ed25519 and x25519 keys'
    });
  }

  // Validate Expo push token format
  if (!Expo.isExpoPushToken(expoPushToken)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Expo push token format'
    });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO recipients (recipient_id, expo_push_token, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(recipient_id) 
      DO UPDATE SET expo_push_token = ?, updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(recipientId, expoPushToken, expoPushToken);

    res.json({
      success: true,
      recipient: recipientId
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register recipient'
    });
  }
});

// Send notification to recipient
app.post('/send', async (req, res) => {
  const { recipientId, title, body, data, sound, badge, channelId, encryptedMessage, destination, origin, timestamp, signature } = req.body;
  console.log('Send notification request:', sanitizeForLog(req.body));

  if (!encryptedMessage || !destination || !timestamp || !signature) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: encryptedMessage, destination, timestamp, signature'
    });
  }

  // Validate timestamp is a number
  if (typeof timestamp !== 'number' || timestamp <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid timestamp: must be a positive number'
    });
  }

  // Validate signature format (hex string)
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid signature: must be 128-character hex string'
    });
  }

  // Validate destination (public key object)
  if (!isValidKeyObject(destination)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid destination format: must be JSON with ed25519 and x25519 keys'
    });
  }

  // Validate origin if provided (public key object)
  if (origin && !isValidKeyObject(origin)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid origin format: must be JSON with ed25519 and x25519 keys'
    });
  }

  // Validate encrypted message format
  if (!isValidEncryptedMessage(encryptedMessage)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid encrypted message format: must contain encrypted, signature, and nonce hex strings'
    });
  }

  // Verify request signature (authentication)
  if (!origin || !verifyRequestSignature(origin, timestamp, destination, encryptedMessage, signature)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired signature'
    });
  }

  try {
    // Look up recipient's Expo push token
    const stmt = db.prepare('SELECT expo_push_token FROM recipients WHERE recipient_id = ?');
    const recipient = stmt.get(destination);

    if (!recipient) {
      return res.status(404).json({
        success: false,
        error: 'Recipient not found'
      });
    }

    const { encrypted, signature, nonce } = JSON.parse(encryptedMessage);
    // Prepare notification message
    const message = {
      to: recipient.expo_push_token,
      title: "Ring ring!",
      body: "A new message has arrived",
      data: {
        origin: origin,
        destination: destination,
        encryptedMessage:{
            encrypted: encrypted,
            signature: signature,
            nonce: nonce,
        }
      },
      sound: sound || 'default',
    };

    if (badge !== undefined) message.badge = badge;
    if (channelId) message.channelId = channelId;

    // Send notification via Expo
    const ticket = await expo.sendPushNotificationsAsync([message]);

    res.json({
      success: true,
      recipient: recipientId,
      ticket: ticket[0]
    });
  } catch (error) {
    console.error('Push notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification'
    });
  }
});

// Cleanup stale registrations (older than 24 hours)
app.post('/cleanup', (req, res) => {
  const { key } = req.body;

  // Simple key-based protection for cleanup endpoint
  if (!key || key !== CLEANUP_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid cleanup key'
    });
  }

  try {
    const stmt = db.prepare(`
      DELETE FROM recipients 
      WHERE updated_at < datetime('now', '-24 hours')
    `);
    
    const result = stmt.run();

    res.json({
      success: true,
      deletedCount: result.changes,
      message: `Removed ${result.changes} stale registration(s)`
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup stale registrations'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Whispers backend running on port ${PORT}`);
  console.log(`📊 Database: ${DB_PATH}`);
});
