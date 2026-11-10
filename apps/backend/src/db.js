const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Open the SQLite database, create the schema if needed, and return a wrapper
 * exposing prepared-statement helpers. All queries are parameterized.
 */
function initializeDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id TEXT UNIQUE NOT NULL,
      expo_push_token TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_recipient_id ON recipients(recipient_id);

    -- Replay protection: every accepted signature is recorded once.
    CREATE TABLE IF NOT EXISTS seen_requests (
      sig_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_seen_expires ON seen_requests(expires_at);

    -- Recipient-controlled allow-list. Only listed senders may push to a recipient.
    CREATE TABLE IF NOT EXISTS allowed_senders (
      recipient_ed25519 TEXT NOT NULL,
      sender_ed25519 TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (recipient_ed25519, sender_ed25519)
    );
  `);

  const stmts = {
    upsertRecipient: db.prepare(`
      INSERT INTO recipients (recipient_id, expo_push_token, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(recipient_id)
      DO UPDATE SET expo_push_token = excluded.expo_push_token, updated_at = CURRENT_TIMESTAMP
    `),
    getToken: db.prepare('SELECT expo_push_token FROM recipients WHERE recipient_id = ?'),
    deleteStaleRecipients: db.prepare(
      "DELETE FROM recipients WHERE updated_at < datetime('now', '-24 hours')"
    ),
    insertNonce: db.prepare('INSERT INTO seen_requests (sig_hash, expires_at) VALUES (?, ?)'),
    deleteExpiredNonces: db.prepare('DELETE FROM seen_requests WHERE expires_at < ?'),
    addAllowed: db.prepare(`
      INSERT INTO allowed_senders (recipient_ed25519, sender_ed25519, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(recipient_ed25519, sender_ed25519) DO NOTHING
    `),
    removeAllowed: db.prepare(
      'DELETE FROM allowed_senders WHERE recipient_ed25519 = ? AND sender_ed25519 = ?'
    ),
    isAllowed: db.prepare(
      'SELECT 1 FROM allowed_senders WHERE recipient_ed25519 = ? AND sender_ed25519 = ? LIMIT 1'
    ),
  };

  return {
    raw: db,

    upsertRecipient(recipientId, expoPushToken) {
      stmts.upsertRecipient.run(recipientId, expoPushToken);
    },

    getToken(recipientId) {
      const row = stmts.getToken.get(recipientId);
      return row ? row.expo_push_token : null;
    },

    /**
     * Record a signature as seen. Returns true if it was fresh, false if it was
     * already recorded (replay).
     */
    recordNonce(sigHash, expiresAt) {
      try {
        stmts.insertNonce.run(sigHash, expiresAt);
        return true;
      } catch (err) {
        if (err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return false;
        throw err;
      }
    },

    addAllowedSender(recipientEd25519, senderEd25519, now = Date.now()) {
      stmts.addAllowed.run(recipientEd25519, senderEd25519, now);
    },

    removeAllowedSender(recipientEd25519, senderEd25519) {
      stmts.removeAllowed.run(recipientEd25519, senderEd25519);
    },

    isSenderAllowed(recipientEd25519, senderEd25519) {
      return stmts.isAllowed.get(recipientEd25519, senderEd25519) !== undefined;
    },

    /** Remove stale recipient rows and expired replay records. */
    cleanup(now = Date.now()) {
      const recipients = stmts.deleteStaleRecipients.run().changes;
      const nonces = stmts.deleteExpiredNonces.run(now).changes;
      return { recipients, nonces };
    },

    close() {
      db.close();
    },
  };
}

module.exports = { initializeDatabase };
