'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy, getDoc, setDoc } from 'firebase/firestore';
import type { EstimatedInvoice } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getInvoicesCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'estimatedInvoices');
};


const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): EstimatedInvoice => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        invoiceNumber: data.invoiceNumber,
        date: data.date,
        partyName: data.partyName,
        panNumber: data.panNumber,
        items: data.items,
        grossTotal: data.grossTotal,
        vatTotal: data.vatTotal,
        netTotal: data.netTotal,
        amountInWords: data.amountInWords,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
}

export const getEstimatedInvoices = async (): Promise<EstimatedInvoice[]> => {
    const q = query(getInvoicesCollection(), orderBy('createdAt', 'desc'));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'estimatedInvoices',
            operation: 'list',
        }));
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
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'get',
        }));
        return null;
    }
};

export const addEstimatedInvoice = async (invoice: Omit<EstimatedInvoice, 'id'>): Promise<string> => {
    const payload = {
        ...invoice,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getInvoicesCollection());
    setDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'estimatedInvoices',
            operation: 'create',
            requestResourceData: payload,
        }));
    });
    return docRef.id;
};

export const updateEstimatedInvoice = async (id: string, invoice: Partial<Omit<EstimatedInvoice, 'id'>>): Promise<void> => {
    const invoiceDoc = doc(getInvoicesCollection(), id);
    const payload = {
        ...invoice,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(invoiceDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: invoiceDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};


export const onEstimatedInvoicesUpdate = (callback: (invoices: EstimatedInvoice[]) => void): () => void => {
    const q = query(getInvoicesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'estimatedInvoices',
                operation: 'list',
            }));
        }
    );
};

export const deleteEstimatedInvoice = async (id: string): Promise<void> => {
    const invoiceDoc = doc(getInvoicesCollection(), id);
    deleteDoc(invoiceDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: invoiceDoc.path,
            operation: 'delete',
        }));
    });
};