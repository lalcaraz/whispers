import type * as SQLite from 'expo-sqlite';
import { openDatabase, getDb } from './db';

/**
 * Schema version. The database is encrypted (see ./db) and there is no install
 * base to migrate from, so this starts at 1 with the final schema. Older
 * plaintext databases from pre-encryption builds are unreadable with the
 * SQLCipher key and are discarded automatically by openDatabase().
 */
const SCHEMA_VERSION = 1;

function createSchema(db: SQLite.SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      recipientPublicKey TEXT NOT NULL,
      lastMessage TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL,
      conversationId TEXT NOT NULL,
      senderPublicKey TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);
}

/**
 * Open the encrypted database and ensure the schema exists. Must be awaited once
 * at startup before any hook or helper touches the database.
 */
export async function initializeDatabase(): Promise<void> {
  const db = await openDatabase();
  const { user_version: version = 0 } =
    db.getFirstSync<{ user_version: number }>('PRAGMA user_version;') ?? {};
  if (version < SCHEMA_VERSION) {
    createSchema(db);
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
}

/** Delete all rows but keep the tables. */
export async function deleteAllData(): Promise<void> {
  const db = getDb();
  db.runSync('DELETE FROM messages;');
  db.runSync('DELETE FROM conversations;');
}

/** Drop and recreate the tables. */
export async function resetDatabase(): Promise<void> {
  const db = getDb();
  db.execSync('DROP TABLE IF EXISTS messages;');
  db.execSync('DROP TABLE IF EXISTS conversations;');
  createSchema(db);
  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

export async function getDatabaseStats(): Promise<{ messages: number; conversations: number }> {
  try {
    const db = getDb();
    const m = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM messages;');
    const c = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM conversations;');
    return { messages: m?.count ?? 0, conversations: c?.count ?? 0 };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return { messages: 0, conversations: 0 };
  }
}

/**
 * Insert a received message, creating its conversation if needed.
 * @returns the conversation id and whether it was newly created.
 */
export async function insertReceivedMessage(
  message: string,
  conversationId: string,
  senderPublicKey: string,
  createdAt?: string
): Promise<{ conversationId: string; isNewConversation: boolean }> {
  const db = getDb();
  const timestamp = createdAt || new Date().toISOString();

  const existing = db.getFirstSync<{ id: string }>(
    'SELECT id FROM conversations WHERE id = ?;',
    [conversationId]
  );

  let isNewConversation = false;
  if (!existing) {
    db.runSync(
      'INSERT INTO conversations (id, title, recipientPublicKey, lastMessage, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);',
      [conversationId, 'Unknown Contact', senderPublicKey, message, timestamp, timestamp]
    );
    isNewConversation = true;
  } else {
    db.runSync('UPDATE conversations SET lastMessage = ?, updatedAt = ? WHERE id = ?;', [
      message,
      timestamp,
      conversationId,
    ]);
  }

  db.runSync(
    'INSERT INTO messages (value, conversationId, senderPublicKey, createdAt) VALUES (?, ?, ?, ?);',
    [message, conversationId, senderPublicKey, timestamp]
  );

  return { conversationId, isNewConversation };
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const db = getDb();
  db.runSync('UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?;', [
    title,
    new Date().toISOString(),
    conversationId,
  ]);
}
