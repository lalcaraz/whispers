import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * Single owner of the SQLite handle. The database is encrypted at rest with
 * SQLCipher; the key lives in the OS keystore via expo-secure-store. Because the
 * key fetch is async, callers must await `openDatabase()` once at startup and
 * then use the synchronous `getDb()` everywhere else.
 */

export const DB_NAME = 'app.db';
const DB_KEY_STORE = 'db_encryption_key';

let handle: SQLite.SQLiteDatabase | null = null;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** Get the DB encryption key, creating and persisting one on first run. */
async function getDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_STORE);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) return existing;
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(DB_KEY_STORE, key);
  return key;
}

function applyKeyPragmas(db: SQLite.SQLiteDatabase, keyHex: string): void {
  // PRAGMA key must be the very first statement on the connection.
  db.execSync(`PRAGMA key = "x'${keyHex}'";`);
  db.execSync('PRAGMA foreign_keys = ON;');
}

/**
 * Open (or return the already-open) encrypted database handle.
 *
 * If the on-disk file cannot be read with the current key - e.g. a previous
 * emergency wipe removed the key but not the file - the file is discarded and a
 * fresh encrypted database is created.
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;

  const keyHex = await getDatabaseKey();
  let db = SQLite.openDatabaseSync(DB_NAME);
  try {
    applyKeyPragmas(db, keyHex);
    // Force a read to confirm the key actually decrypts the file.
    db.getFirstSync('SELECT count(*) FROM sqlite_master;');
  } catch (err) {
    console.warn('Existing database is unreadable, recreating:', (err as Error).message);
    try {
      db.closeSync();
    } catch {
      /* ignore */
    }
    await SQLite.deleteDatabaseAsync(DB_NAME);
    db = SQLite.openDatabaseSync(DB_NAME);
    applyKeyPragmas(db, keyHex);
  }

  handle = db;
  return handle;
}

/**
 * Synchronous accessor for the open handle. Throws if `openDatabase()` has not
 * completed - callers should be mounted only after the startup gate resolves.
 */
export function getDb(): SQLite.SQLiteDatabase {
  if (!handle) {
    throw new Error('Database not initialized - openDatabase() must be awaited first');
  }
  return handle;
}

/**
 * Irreversibly destroy the local database (emergency wipe). Closes the handle
 * and deletes the underlying files (including -wal / -shm). The encryption key
 * is removed separately by the key layer.
 */
export async function destroyDatabase(): Promise<void> {
  if (handle) {
    try {
      handle.closeSync();
    } catch {
      /* ignore */
    }
    handle = null;
  }
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch (err) {
    console.warn('destroyDatabase: delete failed:', (err as Error).message);
  }
}

/** Remove the persisted DB encryption key (emergency wipe only). */
export async function clearDatabaseKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DB_KEY_STORE);
}
