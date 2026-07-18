'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy, getDoc, setDoc } from 'firebase/firestore';
import type { EstimatedInvoice } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { COLLECTIONS } from '@/lib/constants';

const getInvoicesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.ESTIMATED_INVOICES);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): EstimatedInvoice => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        invoiceNumber: String(data.invoiceNumber || ''),
        date: data.date,
        partyName: String(data.partyName || ''),
        panNumber: data.panNumber ? String(data.panNumber) : undefined,
        items: data.items || [],
        grossTotal: Number(data.grossTotal) || 0,
        vatTotal: Number(data.vatTotal) || 0,
        netTotal: Number(data.netTotal) || 0,
        amountInWords: String(data.amountInWords || ''),
        createdBy: String(data.createdBy || 'System'),
        createdAt: data.createdAt,
        ownership: data.ownership || 'Both',
    };
}

export const getEstimatedInvoices = async (): Promise<EstimatedInvoice[]> => {
    const q = query(getInvoicesCollection(), orderBy('createdAt', 'desc'));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.ESTIMATED_INVOICES, operation: 'list' }));
        }
        throw error;
    }
};

export const getEstimatedInvoice = async (id: string): Promise<EstimatedInvoice | null> => {
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(getInvoicesCollection(), id);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return fromFirestore(docSnap);
        }
        return null;
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
        }
        return null;
    }
};

export const addEstimatedInvoice = async (invoice: Omit<EstimatedInvoice, 'id'>): Promise<string> => {
    const docRef = doc(getInvoicesCollection());
    const payload = { ...invoice, createdAt: new Date().toISOString() };
    
    setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.ESTIMATED_INVOICES,
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
    return docRef.id;
};

export const updateEstimatedInvoice = async (id: string, invoice: Partial<Omit<EstimatedInvoice, 'id'>>): Promise<void> => {
    const invoiceDoc = doc(getInvoicesCollection(), id);
    const payload = { ...invoice, lastModifiedAt: new Date().toISOString() };
    
    updateDoc(invoiceDoc, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.ESTIMATED_INVOICES,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

export const onEstimatedInvoicesUpdate = (callback: (invoices: EstimatedInvoice[]) => void): () => void => {
    const q = query(getInvoicesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.ESTIMATED_INVOICES, operation: 'list' }));
            }
        }
    );
};

export const deleteEstimatedInvoice = async (id: string): Promise<void> => {
    const invoiceDoc = doc(getInvoicesCollection(), id);
    deleteDoc(invoiceDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.ESTIMATED_INVOICES, operation: 'delete' }));
        }
    });
};
