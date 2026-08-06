'use client';

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    getDocs, 
    query, 
    orderBy, 
    deleteDoc, 
    doc, 
    updateDoc 
} from 'firebase/firestore';
import type { Quotation } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'crm_quotations');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Quotation => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        quotationNumber: data.quotationNumber,
        date: data.date,
        dateBS: data.dateBS,
        partyId: data.partyId,
        partyName: data.partyName,
        dealId: data.dealId,
        items: data.items || [],
        total: data.total || 0,
        status: data.status,
        validUntilBS: data.validUntilBS,
        remarks: data.remarks,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

export const onQuotationsUpdate = (callback: (quotations: Quotation[]) => void): () => void => {
    const q = query(getCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'crm_quotations',
            operation: 'list',
        }));
    });
};

export const addQuotation = async (quotation: Omit<Quotation, 'id'>) => {
    return addDoc(getCollection(), {
        ...quotation,
        createdAt: new Date().toISOString()
    });
};

export const updateQuotation = async (id: string, updates: Partial<Quotation>) => {
    const docRef = doc(getCollection(), id);
    return updateDoc(docRef, {
        ...updates,
        lastModifiedAt: new Date().toISOString()
    });
};

export const deleteQuotation = async (id: string) => {
    return deleteDoc(doc(getCollection(), id));
};
