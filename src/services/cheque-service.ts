
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, query, orderBy, updateDoc, getDocs } from 'firebase/firestore';
import type { Cheque } from '@/lib/types';

const getChequesCollection = () => {
    return collection(db, 'cheques');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Cheque => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo,
        paymentDate: data.paymentDate,
        invoiceDate: data.invoiceDate,
        invoiceNumber: data.invoiceNumber,
        partyName: data.partyName,
        payeeName: data.payeeName,
        amount: data.amount,
        amountInWords: data.amountInWords,
        splits: (data.splits || []).map((split: any) => ({
            ...split,
            remarks: split.remarks || '', // Ensure remarks field exists
        })),
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
}

export const addCheque = async (cheque: Omit<Cheque, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await addDoc(getChequesCollection(), {
        ...cheque,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const updateCheque = async (id: string, cheque: Partial<Omit<Cheque, 'id'>>): Promise<void> => {
    const chequeDoc = doc(getChequesCollection(), id);
    await updateDoc(chequeDoc, {
        ...cheque,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const onChequesUpdate = (callback: (cheques: Cheque[]) => void): () => void => {
    const q = query(getChequesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Cheques):", error.message, error);
        }
    );
};

export const getCheques = async (): Promise<Cheque[]> => {
    const q = query(getChequesCollection(), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
}

export const deleteCheque = async (id: string): Promise<void> => {
    const chequeDoc = doc(getChequesCollection(), id);
    await deleteDoc(chequeDoc);
};
