'use client';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, setDoc, query, orderBy } from 'firebase/firestore';
import type { PolicyOrMembership } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { COLLECTIONS } from '@/lib/constants';

const getPoliciesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.POLICIES);
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): PolicyOrMembership => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        type: data.type || 'Insurance',
        provider: data.provider || '',
        policyNumber: data.policyNumber || '',
        startDate: data.startDate || new Date().toISOString(),
        endDate: data.endDate || new Date().toISOString(),
        cost: Number(data.cost) || 0,
        memberId: data.memberId || '',
        memberType: data.memberType || 'Vehicle',
        createdBy: data.createdBy || 'System',
        createdAt: data.createdAt || new Date().toISOString(),
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
        status: data.status || 'Active',
        renewedFromId: data.renewedFromId || null,
        renewedToId: data.renewedToId || null,
    };
}

export const addPolicy = async (policy: Omit<PolicyOrMembership, 'id'>): Promise<string> => {
    const docRef = doc(getPoliciesCollection());
    const payload = { ...policy, createdAt: new Date().toISOString() };
    
    reportWriteFailure(
        setDoc(docRef, payload),
        { path: COLLECTIONS.POLICIES, operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const onPoliciesUpdate = (callback: (policies: PolicyOrMembership[]) => void): () => void => {
    const q = query(getPoliciesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.POLICIES, operation: 'list' }));
            }
        }
    );
};

export const updatePolicy = async (id: string, policy: Partial<Omit<PolicyOrMembership, 'id'>>): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    const payload = { ...policy, lastModifiedAt: new Date().toISOString() };
    
    reportWriteFailure(
        updateDoc(policyDoc, payload),
        { path: COLLECTIONS.POLICIES, operation: 'update', requestResourceData: payload }
    );
};

export const deletePolicy = async (id: string): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    reportWriteFailure(
        deleteDoc(policyDoc),
        { path: COLLECTIONS.POLICIES, operation: 'delete' }
    );
};