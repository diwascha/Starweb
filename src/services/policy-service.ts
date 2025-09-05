
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
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const addPolicy = async (policy: Omit<PolicyOrMembership, 'id'>): Promise<string> => {
    const docRef = await addDoc(policiesCollection, policy);
    return docRef.id;
};

export const onPoliciesUpdate = (callback: (policies: PolicyOrMembership[]) => void): () => void => {
    return onSnapshot(policiesCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updatePolicy = async (id: string, policy: Partial<Omit<PolicyOrMembership, 'id'>>): Promise<void> => {
    const policyDoc = doc(db, 'policies', id);
    await updateDoc(policyDoc, policy);
};

export const deletePolicy = async (id: string): Promise<void> => {
    const policyDoc = doc(db, 'policies', id);
    await deleteDoc(policyDoc);
};
