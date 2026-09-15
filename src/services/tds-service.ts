'use client';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import type { TdsCalculation, DocumentPrefixes, NumberingRule } from '@/lib/types';
import { getSetting } from './settings-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
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
    reportWriteFailure(
        setDoc(docRef, payload),
        { path: 'tdsCalculations', operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const updateTdsCalculation = async (id: string, calculation: Partial<TdsCalculation>): Promise<void> => {
    const calcDoc = doc(getTdsCollection(), id);
    const payload = {
        ...calculation,
        lastModifiedAt: new Date().toISOString(),
    };
    reportWriteFailure(
        updateDoc(calcDoc, payload),
        { path: calcDoc.path, operation: 'update', requestResourceData: payload }
    );
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
    reportWriteFailure(
        deleteDoc(calcDoc),
        { path: 'tdsCalculations', operation: 'delete' }
    );
};
