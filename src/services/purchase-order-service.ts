
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc } from 'firebase/firestore';
import type { PurchaseOrder } from '@/lib/types';

const purchaseOrdersCollection = collection(db, 'purchaseOrders');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): PurchaseOrder => {
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

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
    const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
    if (isDesktop) {
        return [];
    }
    const snapshot = await getDocs(purchaseOrdersCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addPurchaseOrder = async (po: Omit<PurchaseOrder, 'id'>): Promise<string> => {
    const docRef = await addDoc(purchaseOrdersCollection, po);
    return docRef.id;
};

export const onPurchaseOrdersUpdate = (callback: (purchaseOrders: PurchaseOrder[]) => void): () => void => {
    return onSnapshot(purchaseOrdersCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getPurchaseOrder = async (id: string): Promise<PurchaseOrder | null> => {
    const poDoc = doc(db, 'purchaseOrders', id);
    const docSnap = await getDoc(poDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};


export const updatePurchaseOrder = async (id: string, po: Partial<Omit<PurchaseOrder, 'id'>>): Promise<void> => {
    const poDoc = doc(db, 'purchaseOrders', id);
    await updateDoc(poDoc, po);
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    const poDoc = doc(db, 'purchaseOrders', id);
    await deleteDoc(poDoc);
};
