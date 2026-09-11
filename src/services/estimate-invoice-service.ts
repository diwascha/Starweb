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



export const addEstimatedInvoice = async (invoice: Omit<EstimatedInvoice, 'id'>): Promise<string> => {
    const docRef = doc(getInvoicesCollection());
    const payload = { ...invoice, createdAt: new Date().toISOString() };
    
    await setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.ESTIMATED_INVOICES,
                operation: 'create',
                requestResourceData: payload,
            }));
        }
        // Rethrown so the caller's error handling can actually run. This
        // was fire-and-forget: the await resolved before the write, the
        // rejection was swallowed, and every caller toasted success over a
        // write that never landed.
        throw err;
    });
    return docRef.id;
};

export const updateEstimatedInvoice = async (id: string, invoice: Partial<Omit<EstimatedInvoice, 'id'>>): Promise<void> => {
    const invoiceDoc = doc(getInvoicesCollection(), id);
    const payload = { ...invoice, lastModifiedAt: new Date().toISOString() };
    
    await updateDoc(invoiceDoc, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.ESTIMATED_INVOICES,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
        // Rethrown so the caller's error handling can actually run. This
        // was fire-and-forget: the await resolved before the write, the
        // rejection was swallowed, and every caller toasted success over a
        // write that never landed.
        throw err;
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
    await deleteDoc(invoiceDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.ESTIMATED_INVOICES, operation: 'delete' }));
        }
        // Rethrown so the caller's error handling can actually run. This
        // was fire-and-forget: the await resolved before the write, the
        // rejection was swallowed, and every caller toasted success over a
        // write that never landed.
        throw err;
    });
};