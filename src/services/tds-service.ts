
import { db } from '@/lib/firebase';
import { connectionPromiseInstance as connectionPromise } from '@/lib/firebase-connection';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
import type { TdsCalculation, DocumentPrefixes } from '@/lib/types';
import { getSetting } from './settings-service';

const tdsCollection = collection(db, 'tdsCalculations');

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
    await connectionPromise;
    const prefixSetting = await getSetting('documentPrefixes');
    const prefixes = prefixSetting?.value as DocumentPrefixes || {};
    return prefixes.tdsVoucher || 'TDS-';
}

export const addTdsCalculation = async (calculation: Omit<TdsCalculation, 'id' | 'createdAt'>): Promise<string> => {
    await connectionPromise;
    const docRef = await addDoc(tdsCollection, {
        ...calculation,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const getTdsCalculations = async (): Promise<TdsCalculation[]> => {
    await connectionPromise;
    const snapshot = await getDocs(tdsCollection);
    return snapshot.docs.map(fromFirestore);
}

export const onTdsCalculationsUpdate = (callback: (calculations: TdsCalculation[]) => void): () => void => {
    connectionPromise.then(() => {
        // Ready to listen
    }).catch(err => console.error("Firestore connection failed, not attaching listener", err));

    return onSnapshot(tdsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const deleteTdsCalculation = async (id: string): Promise<void> => {
    await connectionPromise;
    const calcDoc = doc(db, 'tdsCalculations', id);
    await deleteDoc(calcDoc);
};
