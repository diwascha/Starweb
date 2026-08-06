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
import type { Deal } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'crm_deals');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Deal => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        title: data.title,
        partyId: data.partyId,
        partyName: data.partyName,
        value: data.value || 0,
        stage: data.stage,
        expectedCloseDateBS: data.expectedCloseDateBS,
        expectedCloseDate: data.expectedCloseDate,
        notes: data.notes,
        lostReason: data.lostReason,
        closedAt: data.closedAt,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

export const onDealsUpdate = (callback: (deals: Deal[]) => void): () => void => {
    const q = query(getCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'crm_deals',
                operation: 'list',
            }));
        }
    });
};

export const addDeal = async (deal: Omit<Deal, 'id'>) => {
    return addDoc(getCollection(), {
        ...deal,
        createdAt: new Date().toISOString()
    });
};

export const updateDeal = async (id: string, updates: Partial<Deal>) => {
    const docRef = doc(getCollection(), id);
    return updateDoc(docRef, {
        ...updates,
        lastModifiedAt: new Date().toISOString()
    });
};

export const deleteDeal = async (id: string) => {
    return deleteDoc(doc(getCollection(), id));
};
