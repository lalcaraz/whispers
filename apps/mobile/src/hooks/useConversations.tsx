import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import { getDb } from "@/utils/db";
import { generateConversationId, ensureKeys } from '@/utils/keys';
import { addContact, removeContact, reconcileContacts } from '@/utils/contacts';
import { ed25519FromKeyString } from '@/utils/crypto-core';

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

const ConversationsContext = createContext<UseConversationsResult | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
    // Safe: providers mount only after the startup database gate has resolved.
    const db = useMemo(() => getDb(), []);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const init = useCallback(async () => {
        setLoading(false);
    }, []);

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
                const { publicKey: localPublicKey } = await ensureKeys();
                const conversationId = await generateConversationId(localPublicKey, recipientPublicKey);
                
                db.runSync(
                    "INSERT INTO conversations (id, title, recipientPublicKey, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?);",
                    [conversationId, title, recipientPublicKey, now, now]
                );
                await readConversations();

                // Allow this contact to send us push notifications.
                const contactKey = ed25519FromKeyString(recipientPublicKey);
                if (contactKey) {
                    addContact(contactKey).catch(err =>
                        console.error('Failed to allow-list contact:', err)
                    );
                }
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
                const row = db.getFirstSync<{ recipientPublicKey: string }>(
                    "SELECT recipientPublicKey FROM conversations WHERE id = ?;",
                    [id]
                );
                db.runSync("DELETE FROM conversations WHERE id = ?;", [id]);
                await readConversations();

                // Revoke this contact's ability to push to us.
                const contactKey = row && ed25519FromKeyString(row.recipientPublicKey);
                if (contactKey) {
                    removeContact(contactKey).catch(err =>
                        console.error('Failed to de-list contact:', err)
                    );
                }
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
        init()
            .then(readConversations)
            .then(() => {
                // One-time: push every existing conversation partner to the backend
                // allow-list (covers installs created before allow-listing existed).
                const rows = db.getAllSync<{ recipientPublicKey: string }>(
                    'SELECT recipientPublicKey FROM conversations;'
                );
                const keys = rows
                    .map(r => ed25519FromKeyString(r.recipientPublicKey))
                    .filter((k): k is string => !!k);
                return reconcileContacts(keys);
            })
            .catch(err => console.error('Conversations init failed:', err));
    }, [init, readConversations, db]);

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
