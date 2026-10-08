'use client';
/**
 * @fileOverview Per-customer QC tolerances (e.g. Unilever ±2 mm on size,
 * Antarctic ±10 mm). One document per customer, id = party id, plus
 * `_default` for every customer without their own value.
 */
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { reportWriteFailure } from '@/lib/write-reporting';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { deepStripUndefined } from '@/lib/service-utils';
import type { ToleranceValues } from '@/lib/qc-check';

export const DEFAULT_TOLERANCE_ID = '_default';

export interface QcToleranceDoc {
    id: string; // party id, or '_default'
    partyName: string;
    values: ToleranceValues;
    lastModifiedBy?: string;
    lastModifiedAt?: string;
}

const col = () => collection(getFirebase().db, COLLECTIONS.QC_TOLERANCES);

export const onQcTolerancesUpdate = (callback: (docs: QcToleranceDoc[]) => void): () => void =>
    onSnapshot(col(),
        snap => callback(snap.docs.map(d => ({ id: d.id, partyName: d.data().partyName || '', values: d.data().values || {}, lastModifiedBy: d.data().lastModifiedBy, lastModifiedAt: d.data().lastModifiedAt }))),
        error => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.QC_TOLERANCES, operation: 'list' }));
            }
        });

export const saveQcTolerance = (id: string, partyName: string, values: ToleranceValues, username?: string) => {
    const payload = deepStripUndefined({ partyName, values, lastModifiedBy: username, lastModifiedAt: new Date().toISOString() });
    const ref = doc(col(), id);
    reportWriteFailure(setDoc(ref, payload), { path: ref.path, operation: 'write', requestResourceData: payload });
};
