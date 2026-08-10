
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
    orderBy,
    writeBatch
} from 'firebase/firestore';
import type { PaymentTrackerEntry } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { generateNextPaymentTrackerNumber } from '@/lib/utils';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAYMENT_TRACKER);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): PaymentTrackerEntry => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo,
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

export const savePaymentVoucher = async (data: {
    voucherNo: string;
    date: string;
    entries: Omit<PaymentTrackerEntry, 'id' | 'createdAt' | 'createdBy' | 'date' | 'voucherNo'>[];
    createdBy: string;
}): Promise<void> => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    const createdAt = new Date().toISOString();

    data.entries.forEach(entry => {
        const docRef = doc(getCollection());
        batch.set(docRef, {
            ...entry,
            voucherNo: data.voucherNo,
            date: data.date,
            createdBy: data.createdBy,
            createdAt
        });
    });

    await batch.commit().catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.PAYMENT_TRACKER,
                operation: 'create',
                requestResourceData: data,
            }));
        }
    });
};

export const addPaymentEntry = async (entry: Omit<PaymentTrackerEntry, 'id' | 'createdAt'>): Promise<string> => {
    const { db } = getFirebase();
    const docRef = doc(getCollection());
    
    // Generate numbering
    const snap = await getDocs(getCollection());
    const existing = snap.docs.map(fromFirestore);
    const voucherNo = await generateNextPaymentTrackerNumber(existing, entry.date);

    const payload = {
        ...entry,
        voucherNo,
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
