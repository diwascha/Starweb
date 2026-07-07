/**
 * @fileOverview Party service for vendors, suppliers, and tenants.
 * Refactored for non-blocking offline writes and robust cache handling.
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    limit, 
    setDoc,
    getDocFromCache,
    getDocsFromCache
} from 'firebase/firestore';
import type { Party } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getPartiesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PARTIES || 'parties');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Party => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        type: data.type,
        ownership: data.ownership || 'Both',
        address: data.address,
        panNumber: data.panNumber,
        photoURL: data.photoURL,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

/**
 * Fetches parties with a fallback to cache for offline support.
 */
export const getParties = async (): Promise<Party[]> => {
    try {
        const snapshot = await getDocs(getPartiesCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        // Fallback to cache if network fails
        try {
            const cacheSnap = await getDocsFromCache(getPartiesCollection());
            return cacheSnap.docs.map(fromFirestore);
        } catch {
            return [];
        }
    }
};

export const getParty = async (id: string): Promise<Party | null> => {
    if (!id) return null;
    const docRef = doc(getPartiesCollection(), id);
    try {
        const snap = await getDoc(docRef);
        return snap.exists() ? fromFirestore(snap) : null;
    } catch {
        try {
            const cacheSnap = await getDocFromCache(docRef);
            return cacheSnap.exists() ? fromFirestore(cacheSnap) : null;
        } catch {
            return null;
        }
    }
}

export const getPartyByName = async (name: string): Promise<Party | null> => {
    if (!name) return null;
    const q = query(getPartiesCollection(), where("name", "==", name), limit(1));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) return fromFirestore(querySnapshot.docs[0]);
        return null;
    } catch {
        try {
            const cacheSnap = await getDocsFromCache(q);
            if (!cacheSnap.empty) return fromFirestore(cacheSnap.docs[0]);
            return null;
        } catch {
            return null;
        }
    }
};

export const addParty = async (party: Omit<Party, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = doc(getPartiesCollection());
    const id = docRef.id;
    const now = new Date().toISOString();
    
    const payload = {
        ...party,
        createdAt: now,
    };

    // Non-blocking setDoc for offline resilience
    setDoc(docRef, payload).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: payload,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });

    return id;
};

export const onPartiesUpdate = (callback: (parties: Party[]) => void): () => void => {
    return onSnapshot(getPartiesCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
             errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.PARTIES, operation: 'list' }));
        }
    );
};

export const updateParty = async (id: string, party: Partial<Omit<Party, 'id'>>): Promise<void> => {
    if (!id) return;
    const partyDoc = doc(getPartiesCollection(), id);
    const payload = {
        ...party,
        lastModifiedAt: new Date().toISOString(),
    };

    updateDoc(partyDoc, payload).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
            path: partyDoc.path,
            operation: 'update',
            requestResourceData: payload,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
};

export const deleteParty = async (id: string): Promise<void> => {
    if (!id) return;
    const partyDoc = doc(getPartiesCollection(), id);
    deleteDoc(partyDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: partyDoc.path, operation: 'delete' }));
    });
};

export const mergeParties = async (sourceId: string, destinationId: string): Promise<void> => {
    const { db } = getFirebase();
    if (sourceId === destinationId) throw new Error("Cannot merge a party into itself.");

    // This operation is complex and requires current data, so we attempt to read first.
    const destSnap = await getDoc(doc(db, COLLECTIONS.PARTIES, destinationId));
    const sourceSnap = await getDoc(doc(db, COLLECTIONS.PARTIES, sourceId));
    
    if (!destSnap.exists() || !sourceSnap.exists()) {
        throw new Error("One or more parties not found for merge.");
    }
    
    const destinationParty = fromFirestore(destSnap);
    const sourceParty = fromFirestore(sourceSnap);

    const collectionsToUpdateById = [
        { name: COLLECTIONS.PURCHASE_ORDERS, field: 'partyId', payload: { partyId: destinationParty.id, companyName: destinationParty.name, companyAddress: destinationParty.address, panNumber: destinationParty.panNumber } },
        { name: COLLECTIONS.PRODUCTS, field: 'partyId', payload: { partyId: destinationParty.id, partyName: destinationParty.name, partyAddress: destinationParty.address } },
        { name: COLLECTIONS.TRIPS, field: 'partyId', payload: { partyId: destinationParty.id } },
        { name: COLLECTIONS.TRANSACTIONS, field: 'partyId', payload: { partyId: destinationParty.id } },
    ];
    
    const collectionsToUpdateByName = [
        { name: COLLECTIONS.ESTIMATED_INVOICES, field: 'partyName', payload: { partyName: destinationParty.name, panNumber: destinationParty.panNumber } },
        { name: COLLECTIONS.CHEQUES, field: 'partyName', payload: { partyName: destinationParty.name, payeeName: destinationParty.name } },
    ];

    const batch = (await import('firebase/firestore')).writeBatch(db);

    for (const coll of collectionsToUpdateById) {
        const q = query(collection(db, coll.name), where(coll.field, "==", sourceId));
        const snapshot = await getDocs(q);
        snapshot.forEach(d => batch.update(d.ref, coll.payload));
    }

    for (const coll of collectionsToUpdateByName) {
        const q = query(collection(db, coll.name), where(coll.field, "==", sourceParty.name));
        const snapshot = await getDocs(q);
        snapshot.forEach(d => batch.update(d.ref, coll.payload));
    }

    batch.delete(sourceSnap.ref);
    batch.commit().catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'batch-merge', operation: 'write' }));
    });
};
