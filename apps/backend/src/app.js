/**
 * Express app factory. Kept separate from server.js so tests can exercise the
 * routes without binding a port or spawning a process.
 */
function createApp({ db, sendPush, config, deps }) {
  const { express, helmet, rateLimit, Expo, auth } = deps;
  const { timestampTolerance, cleanupKey, trustProxyHops, isProd } = config;

  // A replay record only needs to outlive the window in which its timestamp
  // would still pass isTimestampValid().
  const NONCE_TTL_MS = timestampTolerance + auth.FORWARD_SKEW_MS;

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.set('trust proxy', trustProxyHops);
  app.use(express.json({ limit: '10kb' }));

  // Reject oversized / malformed JSON before it reaches a handler.
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'Payload too large' });
    }
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({ success: false, error: 'Invalid JSON body' });
    }
    return next(err);
  });

  // --- Logging ---
  function logEvent(route, outcome, detail) {
    if (isProd) {
      console.log(JSON.stringify({ t: new Date().toISOString(), route, outcome, ...detail }));
    } else {
      console.log(`[${route}] ${outcome}`, detail || '');
    }
  }

  // --- Rate limiting ---
  // /health is intentionally unlimited (cheap, and monitoring polls it). The
  // mutating routes each carry their own limiter below.
  const jsonLimitMessage = { success: false, error: 'Too many requests, please try again later' };

  // Keyed on the authenticated origin key when available, else the client IP,
  // so IP rotation / spoofing cannot reset a sender's budget.
  const sendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: jsonLimitMessage,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const origin = auth.parseEd25519(req.body && req.body.origin);
      return origin ? `k:${origin}` : `ip:${req.ip}`;
    },
  });

  const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: jsonLimitMessage,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // --- Middleware: require the protocol header on authenticated endpoints ---
  function requireProtocol(req, res, next) {
    if (req.get('x-whispers-protocol') !== auth.PROTOCOL_VERSION) {
      return res.status(400).json({
        success: false,
        error: `Unsupported or missing protocol version (expected ${auth.PROTOCOL_VERSION})`,
      });
    }
    return next();
  }

  /**
   * Shared checks for a signed request: timestamp freshness, signature format,
   * signature validity, and single-use (replay) enforcement.
   * Returns { ok: true } or { ok: false, status, error }.
   */
  function verifySignedRequest({ signerEd25519, message, timestamp, signature }) {
    if (typeof timestamp !== 'number' || timestamp <= 0) {
      return { ok: false, status: 400, error: 'Invalid timestamp: must be a positive number' };
    }
    if (!auth.HEX_128.test(String(signature || ''))) {
      return { ok: false, status: 400, error: 'Invalid signature: must be 128-character hex string' };
    }
    if (!auth.isTimestampValid(timestamp, timestampTolerance)) {
      return { ok: false, status: 401, error: 'Unauthorized: timestamp outside acceptable window' };
    }
    if (!auth.verifySignature(signerEd25519, message, signature)) {
      return { ok: false, status: 401, error: 'Unauthorized: invalid signature' };
    }
    const hash = auth.nonceHash(signerEd25519, signature);
    if (!db.recordNonce(hash, Date.now() + NONCE_TTL_MS)) {
      return { ok: false, status: 401, error: 'Unauthorized: request already processed' };
    }
    return { ok: true };
  }

  // --- Routes ---

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', protocol: auth.PROTOCOL_VERSION, timestamp: new Date().toISOString() });
  });

  // Register / update a recipient's push token. Must be signed by the ed25519
  // key inside recipientId, so nobody can hijack another user's mapping.
  app.post('/register', strictLimiter, requireProtocol, (req, res) => {
    const { recipientId, expoPushToken, timestamp, signature } = req.body || {};

    if (!recipientId || !expoPushToken || timestamp === undefined || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipientId, expoPushToken, timestamp, signature',
      });
    }
    if (!auth.isValidKeyObject(recipientId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipientId: must be JSON with ed25519 and x25519 keys',
      });
    }
    if (!Expo.isExpoPushToken(expoPushToken)) {
      return res.status(400).json({ success: false, error: 'Invalid Expo push token format' });
    }

    const signerEd25519 = auth.parseEd25519(recipientId);
    const check = verifySignedRequest({
      signerEd25519,
      message: auth.registerMessage(timestamp, recipientId, expoPushToken),
      timestamp,
      signature,
    });
    if (!check.ok) {
      logEvent('register', 'rejected', { reason: check.error, key: auth.fingerprint(signerEd25519) });
      return res.status(check.status).json({ success: false, error: check.error });
    }

    try {
      db.upsertRecipient(recipientId, expoPushToken);
      logEvent('register', 'ok', { key: auth.fingerprint(signerEd25519) });
      return res.json({ success: true, recipient: recipientId });
    } catch (err) {
      console.error('Database error on /register:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to register recipient' });
    }
  });

  // Manage the caller's allow-list of senders. Signed by recipientId's ed25519 key.
  app.post('/contacts', strictLimiter, requireProtocol, (req, res) => {
    const { recipientId, action, contactEd25519, timestamp, signature } = req.body || {};

    if (!recipientId || !action || !contactEd25519 || timestamp === undefined || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipientId, action, contactEd25519, timestamp, signature',
      });
    }
    if (action !== 'add' && action !== 'remove') {
      return res.status(400).json({ success: false, error: 'Invalid action: must be "add" or "remove"' });
    }
    if (!auth.isValidKeyObject(recipientId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipientId: must be JSON with ed25519 and x25519 keys',
      });
    }
    const contact = String(contactEd25519).replace(/^0x/i, '').toLowerCase();
    if (!auth.HEX_64.test(contact)) {
      return res.status(400).json({ success: false, error: 'Invalid contactEd25519: must be 64-character hex' });
    }

    const signerEd25519 = auth.parseEd25519(recipientId);
    const check = verifySignedRequest({
      signerEd25519,
      message: auth.contactsMessage(timestamp, action, contactEd25519),
      timestamp,
      signature,
    });
    if (!check.ok) {
      logEvent('contacts', 'rejected', { reason: check.error, key: auth.fingerprint(signerEd25519) });
      return res.status(check.status).json({ success: false, error: check.error });
    }

    try {
      if (action === 'add') {
        db.addAllowedSender(signerEd25519, contact);
      } else {
        db.removeAllowedSender(signerEd25519, contact);
      }
      logEvent('contacts', 'ok', {
        action,
        key: auth.fingerprint(signerEd25519),
        contact: auth.fingerprint(contact),
      });
      return res.json({ success: true });
    } catch (err) {
      console.error('Database error on /contacts:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to update contacts' });
    }
  });

  // Relay an encrypted message as a push notification.
  app.post('/send', sendLimiter, requireProtocol, async (req, res) => {
    const { encryptedMessage, destination, origin, timestamp, signature, sound, badge, channelId } =
      req.body || {};

    if (!encryptedMessage || !destination || !origin || timestamp === undefined || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: encryptedMessage, destination, origin, timestamp, signature',
      });
    }
    if (!auth.isValidKeyObject(destination)) {
      return res.status(400).json({ success: false, error: 'Invalid destination format' });
    }
    if (!auth.isValidKeyObject(origin)) {
      return res.status(400).json({ success: false, error: 'Invalid origin format' });
    }
    if (!auth.isValidEncryptedMessage(encryptedMessage)) {
      return res.status(400).json({ success: false, error: 'Invalid encrypted message format' });
    }

    const originEd25519 = auth.parseEd25519(origin);
    const destinationEd25519 = auth.parseEd25519(destination);
    const check = verifySignedRequest({
      signerEd25519: originEd25519,
      message: auth.sendMessage(timestamp, destination, encryptedMessage),
      timestamp,
      signature,
    });
    if (!check.ok) {
      logEvent('send', 'rejected', { reason: check.error, from: auth.fingerprint(originEd25519) });
      return res.status(check.status).json({ success: false, error: check.error });
    }

    // Allow-list: the recipient must have added this sender.
    if (!db.isSenderAllowed(destinationEd25519, originEd25519)) {
      logEvent('send', 'blocked', {
        from: auth.fingerprint(originEd25519),
        to: auth.fingerprint(destinationEd25519),
      });
      return res.status(403).json({ success: false, error: 'Recipient is not accepting messages from this sender' });
    }

    const token = db.getToken(destination);
    if (!token) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    try {
      const { encrypted, signature: msgSignature, nonce } = JSON.parse(encryptedMessage);
      const message = {
        to: token,
        title: 'Ring ring!',
        body: 'A new message has arrived',
        data: {
          origin,
          destination,
          encryptedMessage: { encrypted, signature: msgSignature, nonce },
        },
        sound: typeof sound === 'string' ? sound : 'default',
      };
      if (typeof badge === 'number') message.badge = badge;
      if (typeof channelId === 'string') message.channelId = channelId;

      const tickets = await sendPush(message);
      logEvent('send', 'ok', {
        from: auth.fingerprint(originEd25519),
        to: auth.fingerprint(destinationEd25519),
      });
      return res.json({ success: true, ticket: tickets[0] });
    } catch (err) {
      console.error('Push notification error:', err.message);
      return res.status(502).json({ success: false, error: 'Failed to send notification' });
    }
  });

  // Operational cleanup of stale data. Protected by a shared secret.
  app.post('/cleanup', strictLimiter, (req, res) => {
    const { key } = req.body || {};
    if (!auth.timingSafeEqualStr(String(key || ''), cleanupKey) || cleanupKey.length === 0) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    try {
      const { recipients, nonces } = db.cleanup();
      return res.json({
        success: true,
        deletedCount: recipients,
        expiredNonces: nonces,
        message: `Removed ${recipients} stale registration(s)`,
      });
    } catch (err) {
      console.error('Cleanup error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to cleanup' });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err && err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
