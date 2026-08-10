
'use client';
import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    query, 
    orderBy 
} from 'firebase/firestore';
import type { PaymentTrackerEntry } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAYMENT_TRACKER);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): PaymentTrackerEntry => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        type: data.type as 'Received' | 'Outflow',
        partyName: data.partyName || '',
        description: data.description || '',
        amount: Number(data.amount) || 0,
        createdBy: data.createdBy || 'System',
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
        ownership: data.ownership || 'Both',
    };
};

export const onPaymentEntriesUpdate = (callback: (entries: PaymentTrackerEntry[]) => void): () => void => {
    const q = query(getCollection(), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.PAYMENT_TRACKER,
                operation: 'list',
            }));
        }
    });
};

export const addPaymentEntry = async (entry: Omit<PaymentTrackerEntry, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = doc(getCollection());
    const payload = {
        ...entry,
        createdAt: new Date().toISOString(),
    };
    
    setDoc(docRef, payload).catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.PAYMENT_TRACKER,
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
    return docRef.id;
};

export const updatePaymentEntry = async (id: string, updates: Partial<PaymentTrackerEntry>): Promise<void> => {
    const docRef = doc(getCollection(), id);
    const payload = {
        ...updates,
        lastModifiedAt: new Date().toISOString(),
    };

    updateDoc(docRef, payload).catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

export const deletePaymentEntry = async (id: string): Promise<void> => {
    const docRef = doc(getCollection(), id);
    deleteDoc(docRef).catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'delete',
            }));
        }
    });
};
