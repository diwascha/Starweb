'use client';
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
    writeBatch
} from 'firebase/firestore';
import type { Party, PartyType, AccountOwnership } from '@/lib/types';
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
        name: String(data.name || ''),
        type: (data.type || 'Vendor') as PartyType,
        ownership: (data.ownership || 'Both') as AccountOwnership,
        address: data.address ? String(data.address) : undefined,
        panNumber: data.panNumber ? String(data.panNumber) : undefined,
        photoURL: data.photoURL ? String(data.photoURL) : undefined,
        identityType: data.identityType ? String(data.identityType) : undefined,
        documentNumber: data.documentNumber ? String(data.documentNumber) : undefined,
        issueDate: data.issueDate ? String(data.issueDate) : undefined,
        expiryDate: data.expiryDate ? String(data.expiryDate) : undefined,
        createdBy: String(data.createdBy || 'System'),
        createdAt: String(data.createdAt || ''),
        lastModifiedBy: data.lastModifiedBy ? String(data.lastModifiedBy) : undefined,
        lastModifiedAt: data.lastModifiedAt ? String(data.lastModifiedAt) : undefined,
    };
}

export const getParties = async (): Promise<Party[]> => {
    try {
        const snapshot = await getDocs(getPartiesCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.PARTIES,
            operation: 'list',
        } satisfies SecurityRuleContext));
        throw error;
    }
};

export const getParty = async (id: string): Promise<Party | null> => {
    if (!id) return null;
    const docRef = doc(getPartiesCollection(), id);
    try {
        const snap = await getDoc(docRef);
        return snap.exists() ? fromFirestore(snap) : null;
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'get',
        } satisfies SecurityRuleContext));
        return null;
    }
}

export const addParty = async (party: Omit<Party, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = doc(getPartiesCollection());
    const id = docRef.id;
    const now = new Date().toISOString();
    
    const payload = {
        ...party,
        createdAt: now,
    };

    setDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: payload,
        } satisfies SecurityRuleContext));
    });

    return id;
};

export const onPartiesUpdate = (callback: (parties: Party[]) => void): () => void => {
    return onSnapshot(getPartiesCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
             errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                 path: COLLECTIONS.PARTIES, 
                 operation: 'list' 
             } satisfies SecurityRuleContext));
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: partyDoc.path,
            operation: 'update',
            requestResourceData: payload,
        } satisfies SecurityRuleContext));
    });
};

export const deleteParty = async (id: string): Promise<void> => {
    if (!id) return;
    const partyDoc = doc(getPartiesCollection(), id);
    deleteDoc(partyDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ 
            path: partyDoc.path, 
            operation: 'delete' 
        } satisfies SecurityRuleContext));
    });
};

export const mergeParties = async (sourceId: string, destinationId: string): Promise<void> => {
    const { db } = getFirebase();
    const sourceRef = doc(getPartiesCollection(), sourceId);
    const destRef = doc(getPartiesCollection(), destinationId);

    const sourceSnap = await getDoc(sourceRef);
    if (!sourceSnap.exists()) return;

    const batch = writeBatch(db);
    batch.delete(sourceRef);
    batch.commit().catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ 
            path: 'merge_batch', 
            operation: 'write' 
        } satisfies SecurityRuleContext));
    });
};
