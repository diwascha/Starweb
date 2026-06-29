import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs } from 'firebase/firestore';
import type { PolicyOrMembership } from '@/lib/types';
import { addExpense } from './expense-service';

const getPoliciesCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'policies');
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
    const snapshot = await getDocs(getPoliciesCollection());
    return snapshot.docs.map(fromFirestore);
}

export const addPolicy = async (policy: Omit<PolicyOrMembership, 'id'>): Promise<string> => {
    const docRef = await addDoc(getPoliciesCollection(), {
        ...policy,
        createdAt: new Date().toISOString(),
    });

    // Automatically record an expense if there is a cost associated with this policy/membership
    if (policy.cost > 0) {
        try {
            await addExpense({
                date: policy.startDate, // Use the policy start date as the transaction/payment date
                vehicleId: policy.memberType === 'Vehicle' ? policy.memberId : '', // Tied to vehicle if applicable
                expenseType: 'Membership Renewal', // Correct type for renewals
                amount: policy.cost,
                paymentMode: 'Cash', // Default to cash payment
                remarks: `Policy Auto-Entry: ${policy.type} - ${policy.policyNumber} (${policy.provider})`,
                createdBy: policy.createdBy,
            });
        } catch (error) {
            console.error("Auto-expense failed for policy:", error);
        }
    }

    return docRef.id;
};

export const onPoliciesUpdate = (callback: (policies: PolicyOrMembership[]) => void): () => void => {
    return onSnapshot(getPoliciesCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Policies):", error.message, error);
        }
    );
};

export const updatePolicy = async (id: string, policy: Partial<Omit<PolicyOrMembership, 'id'>>): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    await updateDoc(policyDoc, {
        ...policy,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deletePolicy = async (id: string): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    await deleteDoc(policyDoc);
};
