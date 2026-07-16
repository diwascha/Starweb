'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, query, orderBy, updateDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import type { Cheque } from '@/lib/types';
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
        voucherNo: String(data.voucherNo || ''),
        paymentDate: data.paymentDate,
        invoiceDate: data.invoiceDate,
        invoiceNumber: data.invoiceNumber,
        partyName: String(data.partyName || ''),
        payeeName: String(data.payeeName || ''),
        amount: Number(data.amount) || 0,
        amountInWords: String(data.amountInWords || ''),
        accountId: data.accountId,
        splits: (data.splits || []).map((split: any) => ({
            ...split,
            remarks: split.remarks || '',
        })),
        createdBy: String(data.createdBy || 'System'),
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const addCheque = async (cheque: Omit<Cheque, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = doc(getChequesCollection());
    const payload = {
        ...cheque,
        createdAt: new Date().toISOString(),
    };
    
    setDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'cheques',
            operation: 'create',
            requestResourceData: payload,
        } satisfies SecurityRuleContext));
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
        } satisfies SecurityRuleContext));
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
            } satisfies SecurityRuleContext));
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
        } satisfies SecurityRuleContext));
        throw error;
    }
}

export const deleteCheque = async (id: string): Promise<void> => {
    const chequeDoc = doc(getChequesCollection(), id);
    
    deleteDoc(chequeDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: chequeDoc.path,
            operation: 'delete',
        } satisfies SecurityRuleContext));
    });
};
