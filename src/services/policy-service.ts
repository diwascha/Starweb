
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs } from 'firebase/firestore';
import type { PolicyOrMembership } from '@/lib/types';

const policiesCollection = collection(db, 'policies');

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
    };
}

export const getPolicies = async (): Promise<PolicyOrMembership[]> => {
    const snapshot = await getDocs(policiesCollection);
    return snapshot.docs.map(fromFirestore);
}

export const addPolicy = async (policy: Omit<PolicyOrMembership, 'id'>): Promise<string> => {
    const docRef = await addDoc(policiesCollection, {
        ...policy,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onPoliciesUpdate = (callback: (policies: PolicyOrMembership[]) => void): () => void => {
    return onSnapshot(policiesCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        console.error("onPoliciesUpdate listener failed: ", error);
    });
};

export const updatePolicy = async (id: string, policy: Partial<Omit<PolicyOrMembership, 'id'>>): Promise<void> => {
    const policyDoc = doc(db, 'policies', id);
    await updateDoc(policyDoc, {
        ...policy,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deletePolicy = async (id: string): Promise<void> => {
    const policyDoc = doc(db, 'policies', id);
    await deleteDoc(policyDoc);
};
