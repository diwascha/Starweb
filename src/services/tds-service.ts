'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import type { TdsCalculation, DocumentPrefixes, NumberingRule } from '@/lib/types';
import { getSetting } from './settings-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getTdsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'tdsCalculations');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): TdsCalculation => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo,
        date: data.date,
        partyName: data.partyName,
        taxableAmount: data.taxableAmount,
        tdsRate: data.tdsRate,
        tdsAmount: data.tdsAmount,
        vatAmount: data.vatAmount,
        netPayable: data.netPayable,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        ownership: data.ownership || 'Both',
    };
}

export const getTdsPrefix = async (date?: string): Promise<string> => {
    const prefixSetting = await getSetting('documentPrefixes');
    const numberingConfig = prefixSetting?.value as DocumentPrefixes || {};
    const rawRules = numberingConfig.tdsVoucher;
    
    const rules = Array.isArray(rawRules) ? rawRules : [];
    
    let matchedRule: NumberingRule | undefined;
    
    if (date) {
        const docDate = new Date(date);
        matchedRule = rules.find(r => {
            const from = new Date(r.effectiveFrom);
            const to = r.effectiveTo ? new Date(r.effectiveTo) : null;
            return docDate >= from && (!to || docDate <= to);
        });
    }

    if (!matchedRule) {
        matchedRule = rules.find(r => r.status === 'Active');
    }
    
    return matchedRule?.prefix || (typeof rawRules === 'string' ? rawRules : 'TDS-');
}

export const addTdsCalculation = async (calculation: Omit<TdsCalculation, 'id' | 'createdAt'>): Promise<string> => {
    const payload = {
        ...calculation,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getTdsCollection());
    await setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'tdsCalculations',
                operation: 'create',
                requestResourceData: payload,
            }));
        }
        // Rethrown so the caller's error handling can actually run. This
        // was fire-and-forget: the await resolved before the write, the
        // rejection was swallowed, and every caller toasted success over a
        // write that never landed.
        throw err;
    });
    return docRef.id;
};

export const updateTdsCalculation = async (id: string, calculation: Partial<TdsCalculation>): Promise<void> => {
    const calcDoc = doc(getTdsCollection(), id);
    const payload = {
        ...calculation,
        lastModifiedAt: new Date().toISOString(),
    };
    await updateDoc(calcDoc, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: calcDoc.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
        // Rethrown so the caller's error handling can actually run. This
        // was fire-and-forget: the await resolved before the write, the
        // rejection was swallowed, and every caller toasted success over a
        // write that never landed.
        throw err;
    });
};


export const onTdsCalculationsUpdate = (callback: (calculations: TdsCalculation[]) => void): () => void => {
    return onSnapshot(getTdsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'tdsCalculations',
                    operation: 'list',
                }));
            }
        }
    );
};

export const deleteTdsCalculation = async (id: string): Promise<void> => {
    const calcDoc = doc(getTdsCollection(), id);
    await deleteDoc(calcDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'tdsCalculations',
                operation: 'delete',
            }));
        }
        // Rethrown so the caller's error handling can actually run. This
        // was fire-and-forget: the await resolved before the write, the
        // rejection was swallowed, and every caller toasted success over a
        // write that never landed.
        throw err;
    });
};
