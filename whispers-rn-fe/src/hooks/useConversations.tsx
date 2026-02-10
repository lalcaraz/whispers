import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import * as SQLite from "expo-sqlite";
import { generateConversationId, getKeys } from '@/utils/keys';

export type Conversation = {
    id: string;
    title: string;
    recipientPublicKey: string;
    lastMessage?: string;
    createdAt: string;
    updatedAt: string;
};

type UseConversationsResult = {
    conversations: Conversation[];
    loading: boolean;
    error: string | null;
    createConversation: (title: string, recipientPublicKey: string) => Promise<void>;
    readConversations: () => Promise<void>;
    updateConversation: (id: string, title: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    deleteAllConversations: () => Promise<void>;
};

const DB_NAME = "app.db";

const ConversationsContext = createContext<UseConversationsResult | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
    const db = useMemo(() => SQLite.openDatabaseSync(DB_NAME), []);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const init = useCallback(async () => {
        try {
            setLoading(true);
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
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [db]);

    const readConversations = useCallback(async () => {
        try {
            setLoading(true);
            const rows = db.getAllSync<Conversation>(
                "SELECT id, title, recipientPublicKey, lastMessage, createdAt, updatedAt FROM conversations ORDER BY updatedAt DESC;"
            );
            setConversations(rows);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [db]);

    const createConversation = useCallback(
        async (title: string, recipientPublicKey: string) => {
            try {
                setLoading(true);
                const now = new Date().toISOString();
                
                // Generate deterministic conversation ID from both public keys
                const { publicKey: localPublicKey } = await getKeys();
                const conversationId = await generateConversationId(localPublicKey, recipientPublicKey);
                
                db.runSync(
                    "INSERT INTO conversations (id, title, recipientPublicKey, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?);",
                    [conversationId, title, recipientPublicKey, now, now]
                );
                await readConversations();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readConversations]
    );

    const updateConversation = useCallback(
        async (id: string, title: string) => {
            try {
                setLoading(true);
                const now = new Date().toISOString();
                db.runSync(
                    "UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?;",
                    [title, now, id]
                );
                await readConversations();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readConversations]
    );

    const deleteConversation = useCallback(
        async (id: string) => {
            try {
                setLoading(true);
                db.runSync("DELETE FROM conversations WHERE id = ?;", [id]);
                await readConversations();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readConversations]
    );

    const deleteAllConversations = useCallback(
        async () => {
            try {
                setLoading(true);
                db.runSync("DELETE FROM conversations;");
                await readConversations();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        },
        [db, readConversations]
    );

    useEffect(() => {
        init().then(readConversations);
    }, [init, readConversations]);

    return (
        <ConversationsContext.Provider
            value={{
                conversations,
                loading,
                error,
                createConversation,
                readConversations,
                updateConversation,
                deleteConversation,
                deleteAllConversations,
            }}
        >
            {children}
        </ConversationsContext.Provider>
    );
}

export default function useConversations(): UseConversationsResult {
    const context = useContext(ConversationsContext);
    if (context === undefined) {
        throw new Error('useConversations must be used within a ConversationsProvider');
    }
    return context;
}
