import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import * as SQLite from "expo-sqlite";

export type StorageItem = {
    id: number;
    value: string;
    conversationId: string;
    createdAt: string;
    senderPublicKey?: string;
};

type UseMessagesResult = {
    items: StorageItem[];
    loading: boolean;
    error: string | null;
    conversationId: string | null;
    createItem: (value: string, conversationId: string) => Promise<void>;
    readItems: (conversationId?: string) => Promise<void>;
    updateItem: (id: number, value: string) => Promise<void>;
    deleteItem: (id: number) => Promise<void>;
    deleteAllItems: (conversationId?: string) => Promise<void>;
};

const DB_NAME = "app.db";

const MessagesContext = createContext<UseMessagesResult | undefined>(undefined);

export function MessagesProvider({ children, conversationId }: { children: ReactNode; conversationId?: string }) {
    const db = useMemo(() => SQLite.openDatabaseSync(DB_NAME), []);
    const [items, setItems] = useState<StorageItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId || null);

    const init = useCallback(async () => {
        try {
            setLoading(true);
            // Enable foreign key constraints
            db.execSync('PRAGMA foreign_keys = ON;');
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
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [db]);

    const readItems = useCallback(async (convId?: string) => {
        try {
            setLoading(true);
            const targetConvId = convId || currentConversationId;
            if (targetConvId) {
                const rows = db.getAllSync<StorageItem>(
                    "SELECT id, value, conversationId, senderPublicKey, createdAt FROM messages WHERE conversationId = ? ORDER BY createdAt DESC;",
                    [targetConvId]
                );
                setItems(rows);
            } else {
                setItems([]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [db, currentConversationId]);

    const createItem = useCallback(
        async (value: string, convId: string) => {
            try {
                setLoading(true);
                const createdAt = new Date().toISOString();
                db.runSync("INSERT INTO messages (value, conversationId, createdAt) VALUES (?, ?, ?);", [
                    value,
                    convId,
                    createdAt,
                ]);
                // Update conversation's lastMessage and updatedAt
                db.runSync(
                    "UPDATE conversations SET lastMessage = ?, updatedAt = ? WHERE id = ?;",
                    [value, createdAt, convId]
                );
                await readItems(convId);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readItems]
    );

    const updateItem = useCallback(
        async (id: number, value: string) => {
            try {
                setLoading(true);
                db.runSync("UPDATE messages SET value = ? WHERE id = ?;", [value, id]);
                await readItems();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readItems]
    );

    const deleteItem = useCallback(
        async (id: number) => {
            try {
                setLoading(true);
                // Get the message's conversationId before deleting
                const message = db.getFirstSync<{ conversationId: number }>(
                    "SELECT conversationId FROM messages WHERE id = ?;",
                    [id]
                );
                db.runSync("DELETE FROM messages WHERE id = ?;", [id]);
                
                // Update conversation's lastMessage if we have a conversationId
                if (message) {
                    const lastMsg = db.getFirstSync<{ value: string }>(
                        "SELECT value FROM messages WHERE conversationId = ? ORDER BY id DESC LIMIT 1;",
                        [message.conversationId]
                    );
                    db.runSync(
                        "UPDATE conversations SET lastMessage = ?, updatedAt = ? WHERE id = ?;",
                        [lastMsg?.value || null, new Date().toISOString(), message.conversationId]
                    );
                }
                await readItems();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readItems]
    );

    const deleteAllItems = useCallback(
        async (convId?: string) => {
            try {
                setLoading(true);
                const targetConvId = convId || currentConversationId;
                if (targetConvId) {
                    db.runSync("DELETE FROM messages WHERE conversationId = ?;", [targetConvId]);
                    // Clear conversation's lastMessage
                    db.runSync(
                        "UPDATE conversations SET lastMessage = NULL, updatedAt = ? WHERE id = ?;",
                        [new Date().toISOString(), targetConvId]
                    );
                } else {
                    db.runSync("DELETE FROM messages;");
                }
                await readItems();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readItems, currentConversationId]
    );

    useEffect(() => {
        setCurrentConversationId(conversationId || null);
    }, [conversationId]);

    useEffect(() => {
        init().then(() => readItems(currentConversationId || undefined));
    }, [init, readItems, currentConversationId]);

    return (
        <MessagesContext.Provider
            value={{ items, loading, error, conversationId: currentConversationId, createItem, readItems, updateItem, deleteItem, deleteAllItems }}
        >
            {children}
        </MessagesContext.Provider>
    );
}

export default function useMessages(): UseMessagesResult {
    const context = useContext(MessagesContext);
    if (context === undefined) {
        throw new Error('useMessages must be used within a MessagesProvider');
    }
    return context;
}