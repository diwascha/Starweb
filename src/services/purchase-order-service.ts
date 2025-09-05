
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { PurchaseOrder } from '@/lib/types';

const purchaseOrdersCollection = collection(db, 'purchaseOrders');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): PurchaseOrder => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        poNumber: data.poNumber,
        poDate: data.poDate,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        companyName: data.companyName,
        companyAddress: data.companyAddress,
        items: data.items,
        amendments: data.amendments,
        status: data.status,
        deliveryDate: data.deliveryDate,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const addPurchaseOrder = async (po: Omit<PurchaseOrder, 'id'>): Promise<string> => {
    const docRef = await addDoc(purchaseOrdersCollection, po);
    return docRef.id;
};

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
    const snapshot = await getDocs(purchaseOrdersCollection);
    return snapshot.docs.map(fromFirestore);
};

export const updatePurchaseOrder = async (id: string, po: Partial<Omit<PurchaseOrder, 'id'>>): Promise<void> => {
    const poDoc = doc(db, 'purchaseOrders', id);
    await updateDoc(poDoc, po);
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    const poDoc = doc(db, 'purchaseOrders', id);
    await deleteDoc(poDoc);
};

export const onPurchaseOrdersUpdate = (callback: (pos: PurchaseOrder[]) => void): (() => void) => {
    return onSnapshot(purchaseOrdersCollection, (snapshot) => {
        const pos = snapshot.docs.map(fromFirestore);
        callback(pos);
    });
};
