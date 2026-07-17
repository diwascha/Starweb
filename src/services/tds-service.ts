'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import type { TdsCalculation, DocumentPrefixes } from '@/lib/types';
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
    };
}

export const getTdsPrefix = async (): Promise<string> => {
    const prefixSetting = await getSetting('documentPrefixes');
    const numberingConfig = prefixSetting?.value as DocumentPrefixes || {};
    const rules = numberingConfig.tdsVoucher || [];
    const activeRule = rules.find(r => r.status === 'Active');
    return activeRule?.prefix || 'TDS-';
}

export const addTdsCalculation = async (calculation: Omit<TdsCalculation, 'id' | 'createdAt'>): Promise<string> => {
    const payload = {
        ...calculation,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getTdsCollection());
    setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'tdsCalculations',
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
    return docRef.id;
};

export const updateTdsCalculation = async (id: string, calculation: Partial<TdsCalculation>): Promise<void> => {
    const calcDoc = doc(getTdsCollection(), id);
    const payload = {
        ...calculation,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(calcDoc, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: calcDoc.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

export const getTdsCalculations = async (): Promise<TdsCalculation[]> => {
    try {
        const snapshot = await getDocs(getTdsCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'tdsCalculations',
                operation: 'list',
            }));
        }
        throw error;
    }
}

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
    deleteDoc(calcDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: calcDoc.path,
                operation: 'delete',
            }));
        }
    });
};
