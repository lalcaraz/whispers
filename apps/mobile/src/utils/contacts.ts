import * as SecureStore from 'expo-secure-store';
import { contactAction } from './backendClient';

const RECONCILED_FLAG = 'contacts_reconciled_v2';

/** Allow a contact (by ed25519 hex) to send us push notifications. */
export async function addContact(contactEd25519: string): Promise<void> {
  await contactAction('add', contactEd25519);
}

/** Revoke a contact's ability to send us push notifications. */
export async function removeContact(contactEd25519: string): Promise<void> {
  await contactAction('remove', contactEd25519);
}

/**
 * One-time: push every existing conversation partner to the backend allow-list.
 * Runs until it fully succeeds; the completion flag is only set when every add
 * went through, so a transient outage just retries on the next launch.
 */
export async function reconcileContacts(contactKeys: string[]): Promise<void> {
  try {
    if (await SecureStore.getItemAsync(RECONCILED_FLAG)) return;

    let failures = 0;
    for (const key of contactKeys) {
      try {
        await contactAction('add', key);
      } catch (err) {
        failures += 1;
        console.warn('reconcileContacts: add failed for', key.slice(0, 8), err);
      }
    }

    if (failures === 0) {
      await SecureStore.setItemAsync(RECONCILED_FLAG, '1');
    }
  } catch (err) {
    console.warn('reconcileContacts failed:', err);
  }
}

/** Clear the reconcile flag (emergency wipe). */
export async function clearContactsState(): Promise<void> {
  await SecureStore.deleteItemAsync(RECONCILED_FLAG);
}
