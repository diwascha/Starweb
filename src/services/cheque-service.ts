'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, query, orderBy, updateDoc, getDocs } from 'firebase/firestore';
import type { Cheque } from '@/lib/types';
import { logServiceError } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getChequesCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'cheques');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Cheque => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo,
        paymentDate: data.paymentDate,
        invoiceDate: data.invoiceDate,
        invoiceNumber: data.invoiceNumber,
        partyName: data.partyName,
        payeeName: data.payeeName,
        amount: data.amount,
        amountInWords: data.amountInWords,
        accountId: data.accountId,
        splits: (data.splits || []).map((split: any) => ({
            ...split,
            remarks: split.remarks || '', // Ensure remarks field exists
        })),
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const addCheque = async (cheque: Omit<Cheque, 'id' | 'createdAt'>): Promise<string> => {
    const payload = {
        ...cheque,
        createdAt: new Date().toISOString(),
    };
    const docRef = await addDoc(getChequesCollection(), payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'cheques',
            operation: 'create',
            requestResourceData: payload,
        }));
        throw err;
    });
    return docRef.id;
};

export const updateCheque = async (id: string, cheque: Partial<Omit<Cheque, 'id'>>): Promise<void> => {
    const chequeDoc = doc(getChequesCollection(), id);
    const payload = {
        ...cheque,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(chequeDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: chequeDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};

export const onChequesUpdate = (callback: (cheques: Cheque[]) => void): () => void => {
    const q = query(getChequesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'cheques',
                operation: 'list',
            }));
        }
    );
};

export const getCheques = async (): Promise<Cheque[]> => {
    const q = query(getChequesCollection(), orderBy('createdAt', 'desc'));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'cheques',
            operation: 'list',
        }));
        throw error;
    }
}

export const deleteCheque = async (id: string): Promise<void> => {
    const chequeDoc = doc(getChequesCollection(), id);
    deleteDoc(chequeDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: chequeDoc.path,
            operation: 'delete',
        }));
    });
};