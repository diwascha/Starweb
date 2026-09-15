/**
 * @fileOverview How a Firestore write reports that it failed.
 *
 * This app is deliberately offline-first: `initializeFirestore` enables a
 * persistent local cache, so a write made with no connection is saved locally,
 * shown immediately by the live listeners, and synced when the network
 * returns. That design has one consequence people get wrong constantly:
 *
 *   A Firestore write promise resolves on SERVER acknowledgement.
 *   While offline it does not resolve, and it does not reject. It PENDS.
 *
 * (The SDK ships `waitForPendingWrites()` precisely because of this.)
 *
 * So `await setDoc(...)` is the wrong shape here. It looks like careful code
 * and it means the save button spins forever the moment the line drops - even
 * though the record is safely queued and already on screen. That is why the
 * services were written fire-and-forget in the first place; two of them say
 * "non-blocking offline writes" in their header.
 *
 * The real defect was never the non-blocking part. It was that the catch only
 * reported `permission-denied` and swallowed every other code - quota
 * exhausted, failed-precondition, invalid-argument, unauthenticated - so those
 * failures vanished with no trace anywhere.
 *
 * Hence this helper. Writes stay non-blocking, and because a pending offline
 * write never rejects, ANY rejection that does arrive is a real failure and is
 * reported. The existing FirebaseErrorListener turns that into a visible
 * error rather than a silent no-op.
 *
 * Use `await` on a write ONLY where the caller genuinely cannot proceed
 * without server confirmation - a transaction, or a number reservation. Those
 * legitimately fail offline, and should.
 */

import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
/**
 * Attach failure reporting to a write, without waiting for the server.
 *
 * Returns immediately. The local cache already holds the write and the live
 * listeners have already fired, which is what the user sees.
 */
export const reportWriteFailure = (
    promise: Promise<unknown>,
    context: SecurityRuleContext
): void => {
    promise.catch((err: any) => {
        // Permission denials keep their rich type: the listener rethrows them
        // into the nearest error boundary with the path and payload attached.
        if (err?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError(context));
            return;
        }

        // Everything else used to be swallowed here. An offline write pends
        // rather than rejecting, so reaching this branch means a genuine
        // failure that the user needs to know about.
        const wrapped = new Error(
            `Firestore ${context.operation} failed on ${context.path}: ${err?.code || 'unknown'} - ${err?.message || err}`
        );
        (wrapped as any).cause = err;
        (wrapped as any).context = context;
        errorEmitter.emit('permission-error', wrapped as any);
    });
};
