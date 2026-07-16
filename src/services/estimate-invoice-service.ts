'use client';
/**
 * @fileOverview Estimate Invoice service.
 * Refactored for contextual error handling and non-blocking writes.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy, getDoc, setDoc } from 'firebase/firestore';
import type { EstimatedInvoice } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getInvoicesCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'estimatedInvoices');
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
        } satisfies SecurityRuleContext));
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
        } satisfies SecurityRuleContext));
        return null;
    }
};

export const addEstimatedInvoice = async (invoice: Omit<EstimatedInvoice, 'id'>): Promise<string> => {
    const docRef = doc(getInvoicesCollection());
    const payload = {
        ...invoice,
        createdAt: new Date().toISOString(),
    };
    
    // Non-blocking creation
    setDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'estimatedInvoices',
            operation: 'create',
            requestResourceData: payload,
        } satisfies SecurityRuleContext));
    });
    return docRef.id;
};

export const updateEstimatedInvoice = async (id: string, invoice: Partial<Omit<EstimatedInvoice, 'id'>>): Promise<void> => {
    const invoiceDoc = doc(getInvoicesCollection(), id);
    const payload = {
        ...invoice,
        lastModifiedAt: new Date().toISOString(),
    };
    
    // Non-blocking update
    updateDoc(invoiceDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: invoiceDoc.path,
            operation: 'update',
            requestResourceData: payload,
        } satisfies SecurityRuleContext));
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
            } satisfies SecurityRuleContext));
        }
    );
};

export const deleteEstimatedInvoice = async (id: string): Promise<void> => {
    const invoiceDoc = doc(getInvoicesCollection(), id);
    
    // Non-blocking delete
    deleteDoc(invoiceDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: invoiceDoc.path,
            operation: 'delete',
        } satisfies SecurityRuleContext));
    });
};