'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs } from 'firebase/firestore';
import type { PolicyOrMembership } from '@/lib/types';
import { addExpense } from './expense-service';
import { logServiceError } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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
    const payload = {
        ...policy,
        createdAt: new Date().toISOString(),
    };
    const docRef = await addDoc(getPoliciesCollection(), payload).catch(async (error) => {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: 'policies',
                operation: 'create',
                requestResourceData: payload,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        } else {
            logServiceError("addPolicy", error);
        }
        throw error;
    });

    if (policy.cost > 0) {
        try {
            await addExpense({
                voucherNo: `POL-${policy.policyNumber}`,
                date: policy.startDate, 
                vehicleId: policy.memberType === 'Vehicle' ? policy.memberId : '', 
                expenseType: 'Membership Renewal',
                amount: policy.cost,
                cashAmount: 0,
                bankAmount: 0,
                extraAmount: 0,
                extraRemarks: '',
                paymentMode: 'Cash', 
                remarks: `Policy Auto-Entry: ${policy.type} - ${policy.policyNumber} (${policy.provider})`,
                createdBy: policy.createdBy,
                partyId: '',
                accountId: '',
                itemId: '',
                destination: '',
            });
        } catch (error) {
            logServiceError("AutoExpensePolicy", error);
        }
    }

    return docRef.id;
};

export const onPoliciesUpdate = (callback: (policies: PolicyOrMembership[]) => void): () => void => {
    const collectionRef = getPoliciesCollection();
    return onSnapshot(collectionRef, 
        (snapshot) => {
            const policies = snapshot.docs.map(fromFirestore);
            callback(policies);
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                const permissionError = new FirestorePermissionError({
                    path: collectionRef.path,
                    operation: 'list',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            } else {
                logServiceError("onPoliciesUpdate", error);
            }
        }
    );
};

export const updatePolicy = async (id: string, policy: Partial<Omit<PolicyOrMembership, 'id'>>): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    const payload = {
        ...policy,
        lastModifiedAt: new Date().toISOString(),
    };
    await updateDoc(policyDoc, payload).catch(async (error) => {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: policyDoc.path,
                operation: 'update',
                requestResourceData: payload,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        } else {
            logServiceError("updatePolicy", error);
        }
    });
};

export const deletePolicy = async (id: string): Promise<void> => {
    const policyDoc = doc(getPoliciesCollection(), id);
    await deleteDoc(policyDoc).catch(async (error) => {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: policyDoc.path,
                operation: 'delete',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        } else {
            logServiceError("deletePolicy", error);
        }
    });
};