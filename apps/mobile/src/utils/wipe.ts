import * as SecureStore from 'expo-secure-store';
import { destroyDatabase, clearDatabaseKey } from './db';
import { clearKeys } from './keys';
import { clearContactsState } from './contacts';
import { STORAGE_KEYS } from '@/constants';

/**
 * Emergency wipe: irreversibly remove all local data and secrets.
 *
 * Order matters - the database file is deleted before its encryption key, so a
 * failure mid-way never leaves a readable database behind.
 */
export async function emergencyWipe(): Promise<void> {
  await destroyDatabase();
  await clearDatabaseKey();
  await clearKeys();
  await clearContactsState();

  await Promise.allSettled([
    SecureStore.deleteItemAsync(STORAGE_KEYS.PUSH_TOKEN),
    SecureStore.deleteItemAsync(STORAGE_KEYS.LAST_REGISTRATION_TIME),
    SecureStore.deleteItemAsync(STORAGE_KEYS.BACKEND_URL),
    SecureStore.deleteItemAsync(STORAGE_KEYS.LOCALE),
  ]);
}
