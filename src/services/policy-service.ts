'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, setDoc, query, orderBy } from 'firebase/firestore';
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
        type: data.type,
        provider: data.provider,
        policyNumber: data.policyNumber,
        startDate: data.startDate,
        endDate: data.endDate,
        cost: data.cost,
        memberId: data.memberId,
        memberType: data.memberType,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
        status: data.status || 'Active',
        renewedFromId: data.renewedFromId || null,
        renewedToId: data.renewedToId || null,
    };
}

export const getPolicies = async (): Promise<PolicyOrMembership[]> => {
    try {
        const snapshot = await getDocs(getPoliciesCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.POLICIES,
            operation: 'list',
        }));
        throw error;
    }
}

export const addPolicy = async (policy: Omit<PolicyOrMembership, 'id'>): Promise<string> => {
    const payload = {
        ...policy,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getPoliciesCollection());
    setDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.POLICIES,
            operation: 'create',
            requestResourceData: payload,
        }));
    });
    return docRef.id;
};

export const onPoliciesUpdate = (callback: (policies: PolicyOrMembership[]) => void): () => void => {
    const q = query(getPoliciesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.POLICIES,
                operation: 'list',
            }));
        }
    );
};

export const updatePolicy = async (id: string, policy: Partial<Omit<PolicyOrMembership, 'id'>>): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    const payload = {
        ...policy,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(policyDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: policyDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};

export const deletePolicy = async (id: string): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    deleteDoc(policyDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: policyDoc.path,
            operation: 'delete',
        }));
    });
};