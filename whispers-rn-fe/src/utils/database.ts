import * as SQLite from "expo-sqlite";

const DB_NAME = "app.db";
const CURRENT_DB_VERSION = 4;

/**
 * Get the current database version
 */
function getDatabaseVersion(db: SQLite.SQLiteDatabase): number {
    try {
        const result = db.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
        return result?.user_version || 0;
    } catch (error) {
        console.error('Error getting database version:', error);
        return 0;
    }
}

/**
 * Set the database version
 */
function setDatabaseVersion(db: SQLite.SQLiteDatabase, version: number): void {
    db.execSync(`PRAGMA user_version = ${version};`);
}

/**
 * Run database migrations
 */
function runMigrations(db: SQLite.SQLiteDatabase, fromVersion: number): void {
    // Migration from version 0 to 1: Initial schema
    if (fromVersion < 1) {
        db.execSync(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                lastMessage TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            );
        `);
        
        db.execSync(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                value TEXT NOT NULL,
                conversationId INTEGER NOT NULL,
                createdAt TEXT NOT NULL,
                FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
            );
        `);
    }
    
    // Migration from version 1 to 2: Add recipientPublicKey to conversations
    if (fromVersion < 2) {
        // Check if column already exists (in case of partial migration)
        const tableInfo = db.getAllSync<{ name: string }>('PRAGMA table_info(conversations);');
        const hasRecipientPublicKey = tableInfo.some(col => col.name === 'recipientPublicKey');
        
        if (!hasRecipientPublicKey) {
            // Add recipientPublicKey column with default empty string for existing rows
            db.execSync('ALTER TABLE conversations ADD COLUMN recipientPublicKey TEXT NOT NULL DEFAULT "";');
        }
    }
    
    // Migration from version 2 to 3: Add senderPublicKey to messages
    if (fromVersion < 3) {
        const tableInfo = db.getAllSync<{ name: string }>('PRAGMA table_info(messages);');
        const hasSenderPublicKey = tableInfo.some(col => col.name === 'senderPublicKey');
        
        if (!hasSenderPublicKey) {
            // Add senderPublicKey column (nullable for existing messages)
            db.execSync('ALTER TABLE messages ADD COLUMN senderPublicKey TEXT;');
        }
    }
    
    // Migration from version 3 to 4: Change conversation IDs from INTEGER to TEXT
    if (fromVersion < 4) {
        // This is a complex migration that requires recreating tables
        // We'll create new tables, copy data (with generated IDs), then swap them
        
        // Import the generateConversationId function dynamically
        // Note: We'll need to handle ID generation carefully
        
        // Step 1: Create new conversations table with TEXT id
        db.execSync(`
            CREATE TABLE IF NOT EXISTS conversations_new (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                recipientPublicKey TEXT NOT NULL,
                lastMessage TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            );
        `);
        
        // Step 2: Create new messages table with TEXT conversationId
        db.execSync(`
            CREATE TABLE IF NOT EXISTS messages_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                value TEXT NOT NULL,
                conversationId TEXT NOT NULL,
                senderPublicKey TEXT,
                createdAt TEXT NOT NULL,
                FOREIGN KEY (conversationId) REFERENCES conversations_new(id) ON DELETE CASCADE
            );
        `);
        
        // Step 3: Since we can't generate proper IDs without user's public key here,
        // we'll just drop old data (this is acceptable for a refactor in development)
        // In production, you'd need a more careful migration strategy
        
        // Step 4: Drop old tables
        db.execSync('DROP TABLE IF EXISTS messages;');
        db.execSync('DROP TABLE IF EXISTS conversations;');
        
        // Step 5: Rename new tables to original names
        db.execSync('ALTER TABLE conversations_new RENAME TO conversations;');
        db.execSync('ALTER TABLE messages_new RENAME TO messages;');
    }
    
    setDatabaseVersion(db, CURRENT_DB_VERSION);
}

/**
 * Initializes the database and creates all tables on first launch
 * MUST be called before any other database operations
 */
export async function initializeDatabase(): Promise<void> {
    try {
        const db = SQLite.openDatabaseSync(DB_NAME);
        
        // Enable foreign key constraints
        db.execSync('PRAGMA foreign_keys = ON;');
        
        // Get current database version
        const currentVersion = getDatabaseVersion(db);
        
        // Run migrations if needed
        if (currentVersion < CURRENT_DB_VERSION) {
            runMigrations(db, currentVersion);
        }
    } catch (error) {
        console.error("Error initializing database:", error);
        throw error;
    }
}

/**
 * Deletes all data from the database (messages and conversations)
 */
export async function deleteAllData(): Promise<void> {
    try {
        const db = SQLite.openDatabaseSync(DB_NAME);
        // Delete messages first due to foreign key constraint
        db.runSync("DELETE FROM messages;");
        db.runSync("DELETE FROM conversations;");
    } catch (error) {
        console.error("Error deleting all data:", error);
        throw error;
    }
}

/**
 * Drops all tables and recreates them (complete database reset)
 */
export async function resetDatabase(): Promise<void> {
    try {
        const db = SQLite.openDatabaseSync(DB_NAME);
        
        // Drop tables
        db.execSync("DROP TABLE IF EXISTS messages;");
        db.execSync("DROP TABLE IF EXISTS conversations;");
        
        // Recreate tables with TEXT id for conversations
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
        
        // Reset version to current
        setDatabaseVersion(db, CURRENT_DB_VERSION);
    } catch (error) {
        console.error("Error resetting database:", error);
        throw error;
    }
}

/**
 * Gets the total count of all items in the database
 */
export async function getDatabaseStats(): Promise<{ messages: number; conversations: number }> {
    try {
        const db = SQLite.openDatabaseSync(DB_NAME);
        
        const messagesCount = db.getFirstSync<{ count: number }>(
            "SELECT COUNT(*) as count FROM messages;"
        );
        
        const conversationsCount = db.getFirstSync<{ count: number }>(
            "SELECT COUNT(*) as count FROM conversations;"
        );
        
        return {
            messages: messagesCount?.count || 0,
            conversations: conversationsCount?.count || 0,
        };
    } catch (error) {
        console.error("Error getting database stats:", error);
        return { messages: 0, conversations: 0 };
    }
}

/**
 * Insert a received message into the database
 * Creates a conversation automatically if it doesn't exist
 * @param message - The message text
 * @param conversationId - The conversation ID (deterministic hash of public keys)
 * @param senderPublicKey - The sender's public key
 * @param createdAt - Optional timestamp (defaults to current time)
 * @returns Object with conversationId and isNewConversation flag
 */
export async function insertReceivedMessage(
    message: string,
    conversationId: string,
    senderPublicKey: string,
    createdAt?: string
): Promise<{ conversationId: string; isNewConversation: boolean }> {
    try {
        const db = SQLite.openDatabaseSync(DB_NAME);
        const timestamp = createdAt || new Date().toISOString();
        
        // Check if conversation exists with this ID
        const existingConv = db.getFirstSync<{ id: string }>(
            "SELECT id FROM conversations WHERE id = ?;",
            [conversationId]
        );
        
        let isNewConversation = false;
        
        // If conversation doesn't exist, create it
        if (!existingConv) {
            db.runSync(
                "INSERT INTO conversations (id, title, recipientPublicKey, lastMessage, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);",
                [conversationId, 'Unknown Contact', senderPublicKey, message, timestamp, timestamp]
            );
            isNewConversation = true;
        } else {
            // Update existing conversation's lastMessage and updatedAt
            db.runSync(
                "UPDATE conversations SET lastMessage = ?, updatedAt = ? WHERE id = ?;",
                [message, timestamp, conversationId]
            );
        }
        
        // Insert the message with sender's public key
        db.runSync(
            "INSERT INTO messages (value, conversationId, senderPublicKey, createdAt) VALUES (?, ?, ?, ?);",
            [message, conversationId, senderPublicKey, timestamp]
        );
        
        return { conversationId, isNewConversation };
    } catch (error) {
        console.error("Error inserting received message:", error);
        throw error;
    }
}

/**
 * Update a conversation's title
 * @param conversationId - The conversation ID
 * @param title - The new title
 */
export async function updateConversationTitle(
    conversationId: string,
    title: string
): Promise<void> {
    try {
        const db = SQLite.openDatabaseSync(DB_NAME);
        const now = new Date().toISOString();
        db.runSync(
            "UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?;",
            [title, now, conversationId]
        );
    } catch (error) {
        console.error("Error updating conversation title:", error);
        throw error;
    }
}
