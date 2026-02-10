# Whispers Backend

Enterprise-grade Node.js relay service for Expo push notifications with cryptographic authentication. Designed for secure, decentralized message routing across multiple independent backend instances.

## Overview

Whispers Backend acts as a secure relay between mobile applications and Expo's push notification service. It authenticates requests using ed25519 signatures, stores recipient mappings in SQLite, and forwards encrypted messages through push notifications.

**Key Features:**
- 🔐 **Cryptographic Authentication** - Ed25519 signature verification with replay attack prevention
- 📊 **SQLite Database** - Lightweight recipient/token mapping with better-sqlite3
- 🚦 **Rate Limiting** - 100 requests per 15 minutes per IP address
- ✅ **Input Validation** - Comprehensive validation of cryptographic keys and payloads
- 🔄 **Decentralized Architecture** - Multiple backends can run independently
- 📱 **Expo Integration** - Native push notification support via Expo Server SDK

## Architecture

### Request Flow
```
Mobile App → [Signature Auth] → [Rate Limit] → [Input Validation] → SQLite Lookup → Expo Push Service → Recipient Device
```

### Security Layers
1. **Rate Limiting**: Prevents DoS attacks (100 req/15min per IP)
2. **Request Size Limits**: 10kb maximum payload to prevent memory exhaustion
3. **Signature Verification**: Ed25519 cryptographic signatures with 5-minute timestamp tolerance
4. **Input Validation**: Strict format validation for all cryptographic fields
5. **SQL Injection Protection**: Parameterized queries with better-sqlite3

### Data Flow
1. **Registration Phase**: Client registers `recipientId` → `expoPushToken` mapping
2. **Send Phase**: 
   - Client signs request with ed25519 private key
   - Backend verifies signature and timestamp
   - Looks up recipient's Expo push token by `destination` key
   - Forwards encrypted message via Expo push notification
   - Returns delivery ticket

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env

# Start development server with auto-reload
npm run dev

# Production mode
npm start
```

## API Endpoints

### `GET /health` - Health Check
Returns server status. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-06T10:30:00.000Z"
}
```

---

### `POST /register` - Register Recipient
Maps a recipient ID to an Expo push token. Updates existing mapping if recipient already registered.

**Rate Limited**: 100 requests per 15 minutes per IP

**Request Body:**
```json
{
  "recipientId": "{\"ed25519\":\"1647ecf5...\",\"x25519\":\"d99c31e0...\"}",
  "expoPushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Validation Rules:**
- `recipientId`: JSON string with `ed25519` and `x25519` public keys (64-character hex strings)
- `expoPushToken`: Valid Expo push token format (verified with `Expo.isExpoPushToken()`)

**Success Response (200):**
```json
{
  "success": true,
  "recipient": "{\"ed25519\":\"1647ecf5...\",\"x25519\":\"d99c31e0...\"}"
}
```

**Error Responses:**
```json
// 400 - Invalid recipientId
{
  "success": false,
  "error": "Invalid recipientId: must be JSON with ed25519 and x25519 keys"
}

// 400 - Invalid token
{
  "success": false,
  "error": "Invalid Expo push token format"
}

// 429 - Rate limit exceeded
{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

---

### `POST /send` - Send Encrypted Notification
Sends an encrypted message to a recipient via push notification. Requires cryptographic signature authentication.

**Rate Limited**: 100 requests per 15 minutes per IP

**Authentication**: Ed25519 signature required (see Authentication section)

**Request Body:**
```json
{
  "encryptedMessage": "{\"encrypted\":\"6f4c405a...\",\"nonce\":\"25b2af57...\",\"signature\":\"39fcde45...\"}",
  "destination": "{\"ed25519\":\"00a13a69...\",\"x25519\":\"6000dd49...\"}",
  "origin": "{\"ed25519\":\"554929f9...\",\"x25519\":\"923d3d9b...\"}",
  "timestamp": 1675634567890,
  "signature": "abc123def456...",
  "sound": "default",
  "badge": 1,
  "channelId": "messages"
}
```

**Required Fields:**
- `encryptedMessage` (string): JSON string with `encrypted`, `nonce`, `signature` hex fields (max 5000 chars)
- `destination` (string): JSON string with recipient's `ed25519` and `x25519` public keys (max 500 chars)
- `origin` (string): JSON string with sender's `ed25519` and `x25519` public keys (max 500 chars)
- `timestamp` (number): Unix timestamp in milliseconds (must be within 5 minutes of server time)
- `signature` (string): 128-character hex string (ed25519 signature of request)

**Optional Fields:**
- `sound` (string): Notification sound (default: "default")
- `badge` (number): Badge count for app icon
- `channelId` (string): Android notification channel ID

**Validation Rules:**
- `encryptedMessage`: Must be valid JSON with hex string fields (`encrypted`, `nonce`, `signature`)
- `destination`/`origin`: Must be valid JSON with 64-character hex keys (`ed25519`, `x25519`)
- `timestamp`: Must be within ±5 minutes of server time (replay attack prevention)
- `signature`: Must be 128-character hex string that verifies against `origin` public key

**Success Response (200):**
```json
{
  "success": true,
  "recipient": "user123",
  "ticket": {
    "id": "abc-123-def-456",
    "status": "ok"
  }
}
```

**Error Responses:**
```json
// 400 - Missing fields
{
  "success": false,
  "error": "Missing required fields: encryptedMessage, destination, timestamp, signature"
}

// 400 - Invalid signature format
{
  "success": false,
  "error": "Invalid signature: must be 128-character hex string"
}

// 401 - Authentication failed
{
  "success": false,
  "error": "Unauthorized: Invalid or expired signature"
}

// 404 - Recipient not found
{
  "success": false,
  "error": "Recipient not found"
}

// 413 - Payload too large
{
  "success": false,
  "error": "Payload too large"
}

// 429 - Rate limit exceeded
{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

## Authentication

The `/send` endpoint uses **signature-based authentication** to prevent unauthorized access and replay attacks.

### Signature Generation (Mobile App)

```javascript
// 1. Generate timestamp
const timestamp = Date.now(); // milliseconds since epoch

// 2. Concatenate fields in exact order (no separators)
const message = `${timestamp}${destination}${encryptedMessage}`;

// 3. Sign with user's ed25519 private key
const messageBytes = Buffer.from(message, 'utf8');
const signatureBytes = ed25519.sign(messageBytes, userPrivateKey);

// 4. Convert to hex string
const signature = Buffer.from(signatureBytes).toString('hex'); // 128 hex chars

// 5. Include in request body
const requestBody = {
  encryptedMessage,
  destination,
  origin,
  timestamp,
  signature
};
```

### Signature Verification (Backend)

1. **Timestamp Validation**: Ensures timestamp is within ±5 minutes of server time (prevents replay attacks)
2. **Message Reconstruction**: Concatenates `timestamp + destination + encryptedMessage` in exact order
3. **Public Key Extraction**: Extracts ed25519 public key from `origin` field
4. **Signature Verification**: Uses TweetNaCl to verify signature against reconstructed message

**Important:**
- Concatenation order is critical: `timestamp` → `destination` → `encryptedMessage`
- No separators, spaces, or delimiters between fields
- Timestamp must be a number (Unix milliseconds)
- Signature must be exactly 128 hex characters

## Database Schema

**Table: `recipients`**
```sql
CREATE TABLE recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id TEXT UNIQUE NOT NULL,
  expo_push_token TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipient_id ON recipients(recipient_id);
```

**Fields:**
- `id`: Auto-incrementing primary key
- `recipient_id`: Unique identifier for recipient (used as lookup key)
- `expo_push_token`: Expo push notification token from mobile device
- `created_at`: Record creation timestamp
- `updated_at`: Last update timestamp (automatically updated on token refresh)

**Storage Location:** `./data/whispers.db` (configurable via `DB_PATH` env var)

## Environment Variables

Create a `.env` file in the project root:

```bash
# Server Configuration
PORT=3000                          # HTTP server port

# Database Configuration
DB_PATH=./data/whispers.db         # SQLite database file path

# Security Configuration
TIMESTAMP_TOLERANCE=300000         # Signature timestamp tolerance in ms (5 minutes)
CLEANUP_KEY=change-me-in-production # Secret key for /cleanup endpoint

# Application Environment
NODE_ENV=development               # development | production
```

**Configuration Details:**
- `PORT`: HTTP port for Express server (default: 3000)
- `DB_PATH`: Path to SQLite database file (default: `./data/whispers.db`)
- `TIMESTAMP_TOLERANCE`: Maximum age of request timestamp in milliseconds (default: 300000 = 5 minutes)
- `CLEANUP_KEY`: Secret key for accessing `/cleanup` endpoint (default: change-me-in-production)
- `NODE_ENV`: Environment mode (affects logging verbosity)

## Security Features

### 1. Rate Limiting
- **Limit**: 100 requests per 15 minutes per IP address
- **Scope**: Applied to `/send` and `/register` endpoints
- **Headers**: Includes standard `RateLimit-*` headers in responses
- **Response**: 429 status code when limit exceeded

### 2. Request Size Limits
- **Maximum**: 10kb JSON payload
- **Protection**: Prevents memory exhaustion attacks
- **Response**: 413 Payload Too Large if exceeded

### 3. Cryptographic Authentication
- **Algorithm**: Ed25519 signature verification
- **Replay Protection**: 5-minute timestamp tolerance window
- **Per-Request**: Each request must have unique timestamp and valid signature
- **No Shared Secrets**: Authentication based on public key cryptography

### 4. Input ValidatiJSON string with ed25519 and x25519 public keys (64-character hex strings)
- **Recipient IDs**: 10-128 alphanumeric characters, hyphens, underscores only
- **Public Keys**: Must be 64-character hex strings (ed25519 and x25519)
- **Encrypted Messages**: Maximum 5000 characters with validated JSON structure
- **Timestamps**: Must be positive numbers within tolerance window
- **Signatures**: Must be exactly 128-character hex strings

### 5. SQL Injection Protection
- **Parameterized Queries**: All database queries use prepared statements
- **Library**: better-sqlite3 with synchronous API
- **Validation**: Additional input sanitization before database operations

### 6. Error Handling
- **No Stack Traces**: Never leak internal error details to clients
- **Generic Messages**: User-facing errors are sanitized
- **Detailed Logging**: Full errors logged server-side for debugging

### 7. Log Sanitization
- **Automatic Redaction**: Sensitive fields (keys, tokens, signatures) truncated in logs
- **Debug-Friendly**: Retains enough information for troubleshooting
- **Production-Safe**: Logs can be safely stored/transmitted without exposing secrets

## Project Structure

```
whispers-backend/
├── src/
│   ├── server.js          # Main application with API endpoints
│   └── db.js              # Database initialization module
├── data/                  # SQLite database storage (gitignored)
│   └── whispers.db
├── .env                   # Environment configuration (gitignored)
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## Testing

### Health Check
```bash
curl http://localhost:3000/health
```

### Register a Recipient
```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "recipientId": "{\"ed25519\":\"1647ecf53dd6de13e851fe6560f18403e933668194e1c2a5fb2e9eb961db28f6\",\"x25519\":\"d99c31e04aff2617995f838ac6646f2795b392c7faac7ea2286a7df9db34846c\"}",
    "expoPushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
  }'
```

### Send Notification (with signature)
```bash
# Note: Signature must be generated by mobile app with proper cryptographic signing
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{
    "encryptedMessage": "{\"encrypted\":\"abc123...\",\"nonce\":\"def456...\",\"signature\":\"ghi789...\"}",
    "destination": "{\"ed25519\":\"00a13a69...\",\"x25519\":\"6000dd49...\"}",
    "origin": "{\"ed25519\":\"554929f9...\",\"x25519\":\"923d3d9b...\"}",
    "timestamp": 1675634567890,
    "signature": "abc123def456..."
  }'
```

### Test Rate Limiting
```bash
# Send 101 requests rapidly to trigger rate limit
for i in {1..101}; do
  curl -X POST http://localhost:3000/register \
    -H "Content-Type: application/json" \
    -d '{"recipientId":"{\\"ed25519\\":\\"test'$i'\\",\\"x25519\\":\\"test'$i'\\"}","expoPushToken":"ExponentPushToken[test]"}'
done
done
```

## Deployment Considerations

### Production Checklist
- [ ] Set `NODE_ENV=production` in environment
- [ ] Configure production `DB_PATH` with proper permissions
- [ ] Place behind reverse proxy (nginx, Cloudflare) for TLS/HTTPS
- [ ] Set up database backups (SQLite file in `data/` directory)
- [ ] Monitor rate limit violations and adjust thresholds
- [ ] Configure log aggregation for error tracking
- [ ] Set `TIMESTAMP_TOLERANCE` based on client clock drift tolerance

### Multi-Backend Setup
This service is designed to run as multiple independent instances:
- Each backend operates with its own SQLite database
- No shared state between backends
- Mobile apps can switch between backend endpoints freely
- Signature authentication works across all backends (public key crypto)

### Reverse Proxy Example (nginx)
```nginx
upstream whispers_backend {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name api.whispers.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://whispers_backend;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

## Dependencies

```json
{
  "better-sqlite3": "^9.6.0",      // Synchronous SQLite with better performance
  "dotenv": "^16.6.1",             // Environment variable management
  "expo-server-sdk": "^3.15.0",    // Expo push notification client
  "express": "^4.22.1",            // Web framework
  "express-rate-limit": "^7.5.1",  // Rate limiting middleware
  "tweetnacl": "^1.0.3"            // Ed25519 signature verification
}
```

**Dev Dependencies:**
```json
{
  "nodemon": "^3.1.11"             // Auto-reload during development
}
```

## Troubleshooting

### Signature Verification Fails
- Ensure mobile app concatenates fields in correct order: `timestamp + destination + encryptedMessage`
- Verify timestamp is within 5 minutes of server time (check clock sync)
- Confirm signature is 128 hex characters (64 bytes)
- Check that origin's ed25519 public key is correct

### Rate Limit Reached Too Quickly
- Adjust rate limit in `src/server.js`: `max: 100` → higher value
- Consider per-user rate limiting instead of per-IP
- Place behind CDN (Cloudflare) with more sophisticated rate limiting

### Database Locked Errors
- better-sqlite3 uses synchronous API - should not have locking issues
- Check file permissions on `data/` directory
- Ensure only one process is accessing the database

### Expo Push Failures
- Verify Expo push tokens are current (tokens can expire)
- Check Expo service status: https://status.expo.dev
- Review Expo push receipts in application logs
- Ensure push token format matches `ExponentPushToken[...]`

## License

MIT

## Additional Resources

- [Expo Push Notifications Documentation](https://docs.expo.dev/push-notifications/overview/)
- [TweetNaCl.js Documentation](https://github.com/dchest/tweetnacl-js)
- [Express Rate Limit](https://express-rate-limit.mintlify.app/)
- [AI Coding Guidelines](.github/copilot-instructions.md)
