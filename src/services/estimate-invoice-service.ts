
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy, getDoc } from 'firebase/firestore';
import type { EstimatedInvoice } from '@/lib/types';

const invoicesCollection = collection(db, 'estimatedInvoices');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): EstimatedInvoice => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        invoiceNumber: data.invoiceNumber,
        date: data.date,
        partyName: data.partyName,
        panNumber: data.panNumber,
        items: data.items,
        grossTotal: data.grossTotal,
        vatTotal: data.vatTotal,
        netTotal: data.netTotal,
        amountInWords: data.amountInWords,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
}

export const getEstimatedInvoices = async (): Promise<EstimatedInvoice[]> => {
    const q = query(invoicesCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
};

export const getEstimatedInvoice = async (id: string): Promise<EstimatedInvoice | null> => {
    const docRef = doc(db, 'estimatedInvoices', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    }
    return null;
};

export const addEstimatedInvoice = async (invoice: Omit<EstimatedInvoice, 'id'>): Promise<string> => {
    const docRef = await addDoc(invoicesCollection, invoice);
    return docRef.id;
};

export const updateEstimatedInvoice = async (id: string, invoice: Partial<Omit<EstimatedInvoice, 'id'>>): Promise<void> => {
    const invoiceDoc = doc(db, 'estimatedInvoices', id);
    await updateDoc(invoiceDoc, {
        ...invoice,
        lastModifiedAt: new Date().toISOString(),
    });
};


export const onEstimatedInvoicesUpdate = (callback: (invoices: EstimatedInvoice[]) => void): () => void => {
    const q = query(invoicesCollection, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const deleteEstimatedInvoice = async (id: string): Promise<void> => {
    const invoiceDoc = doc(db, 'estimatedInvoices', id);
    await deleteDoc(invoiceDoc);
};
