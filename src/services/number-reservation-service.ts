/**
 * @fileOverview Atomic document-number reservation.
 *
 * Every document number in this app (PO, quotation, invoice, voucher, ...)
 * was produced the same way: read the client's list of existing records, take
 * the highest number, add one. That is a read-modify-write with no lock, so
 * two people creating a document at the same moment both read the same
 * highest number and both get the same next one. Nothing detected the clash -
 * the app happily wrote two purchase orders numbered SPI-042.
 *
 * A number is now reserved through a Firestore transaction against a counter
 * document, one per (document type + prefix). The transaction serialises
 * concurrent callers, so two simultaneous requests get consecutive numbers
 * rather than the same one.
 *
 * The counter SELF-HEALS. It is seeded from, and never allowed to fall below,
 * the highest number already present in the collection - which matters
 * because the counter starts empty against databases full of existing
 * records, and because numbers also arrive by import or by someone typing one
 * in by hand. The floor is recomputed on every reservation, so the counter
 * cannot hand out a number that is already on a document.
 *
 * Reservation happens at SAVE, not when a form opens. Reserving on open would
 * burn a number every time somebody opened a form and changed their mind,
 * leaving gaps in a sequence that auditors expect to be unbroken.
 */

import { doc, runTransaction } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Pull the numeric tail off a formatted number, e.g. "SPI-042" -> 42. */
const sequenceOf = (value: string | undefined | null, prefix: string): number => {
    if (!value || typeof value !== 'string' || !value.startsWith(prefix)) return 0;
    const n = parseInt(value.substring(prefix.length), 10);
    return isNaN(n) ? 0 : n;
};

export const formatSequence = (prefix: string, sequence: number): string =>
    `${prefix}${sequence.toString().padStart(3, '0')}`;

/**
 * Reserve the next number for `prefix`, atomically.
 *
 * @param counterKey   document type, e.g. 'purchaseOrder' - one counter per
 *                     type+prefix, since a prefix change (new fiscal year)
 *                     starts a new sequence.
 * @param prefix       the resolved prefix for this document's date.
 * @param existing     numbers already in use, used to seed and floor the
 *                     counter so it can never reissue one.
 * @param startingAt   the numbering rule's configured starting number.
 */
export const reserveNextNumber = async (
    counterKey: string,
    prefix: string,
    existing: (string | undefined | null)[],
    startingAt: number = 1
): Promise<string> => {
    const { db } = getFirebase();
    // The prefix is part of the id, so changing prefix mid-year starts a
    // clean sequence instead of continuing the old one.
    const counterRef = doc(db, COLLECTIONS.NUMBER_COUNTERS, `${counterKey}__${prefix}`);

    // Highest number already on a real document. Recomputed every call so an
    // imported or hand-typed number immediately raises the floor.
    const highestExisting = existing.reduce<number>(
        (max, value) => Math.max(max, sequenceOf(value, prefix)),
        startingAt - 1
    );

    try {
        return await runTransaction(db, async (tx) => {
            const snap = await tx.get(counterRef);
            const stored = snap.exists() ? Number(snap.data()?.lastNumber) || 0 : 0;

            // Whichever is further along wins: the counter, or what is
            // actually on documents.
            const next = Math.max(stored, highestExisting) + 1;

            tx.set(counterRef, {
                lastNumber: next,
                prefix,
                counterKey,
                updatedAt: new Date().toISOString(),
            }, { merge: true });

            return formatSequence(prefix, next);
        });
    } catch (error: any) {
        if (error?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: counterRef.path,
                operation: 'write',
            }));
        }
        throw error;
    }
};
