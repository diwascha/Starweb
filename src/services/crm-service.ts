
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
    where, 
    orderBy, 
    deleteDoc, 
    doc, 
    getDoc, 
    updateDoc 
} from 'firebase/firestore';
import type { CRMContact, InteractionLog } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getContactsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'crm_contacts');
};

const getInteractionsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'crm_interactions');
};

const fromFirestoreContact = (snapshot: QueryDocumentSnapshot<DocumentData>): CRMContact => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        partyId: data.partyId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        designation: data.designation,
        isPrimary: !!data.isPrimary,
        customFields: data.customFields || {},
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy
    };
};

const fromFirestoreInteraction = (snapshot: QueryDocumentSnapshot<DocumentData>): InteractionLog => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        type: data.type,
        subject: data.subject,
        description: data.description,
        date: data.date,
        performer: data.performer,
        contactId: data.contactId,
        partyId: data.partyId,
        createdAt: data.createdAt
    };
};

export const onContactsUpdate = (callback: (contacts: CRMContact[]) => void): () => void => {
    return onSnapshot(getContactsCollection(), (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreContact));
    }, (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'crm_contacts',
            operation: 'list',
        }));
    });
};

export const addContact = async (contact: Omit<CRMContact, 'id'>) => {
    return addDoc(getContactsCollection(), {
        ...contact,
        createdAt: new Date().toISOString()
    });
};

export const updateContact = async (id: string, updates: Partial<CRMContact>) => {
    const docRef = doc(getContactsCollection(), id);
    return updateDoc(docRef, updates);
};

export const deleteContact = async (id: string) => {
    return deleteDoc(doc(getContactsCollection(), id));
};

export const onInteractionsUpdate = (callback: (logs: InteractionLog[]) => void): () => void => {
    const q = query(getInteractionsCollection(), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreInteraction));
    }, (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'crm_interactions',
            operation: 'list',
        }));
    });
};

export const addInteraction = async (log: Omit<InteractionLog, 'id'>) => {
    return addDoc(getInteractionsCollection(), {
        ...log,
        createdAt: new Date().toISOString()
    });
};
