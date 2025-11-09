
import { db } from '@/lib/firebase';
import { connectionPromiseInstance as connectionPromise } from '@/lib/firebase-connection';
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

export const getPurchaseOrders = async (forceFetch: boolean = false): Promise<PurchaseOrder[]> => {
    await connectionPromise;
    const isDesktop = process.env.TAURI_BUILD === 'true';
    if (isDesktop && !forceFetch) {
        return [];
    }
    const snapshot = await getDocs(purchaseOrdersCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addPurchaseOrder = async (po: Omit<PurchaseOrder, 'id'>): Promise<string> => {
    await connectionPromise;
    const docRef = await addDoc(purchaseOrdersCollection, {
        ...po,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onPurchaseOrdersUpdate = (callback: (purchaseOrders: PurchaseOrder[]) => void): () => void => {
    connectionPromise.then(() => {
        // Ready to listen
    }).catch(err => console.error("Firestore connection failed, not attaching listener", err));

    return onSnapshot(purchaseOrdersCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getPurchaseOrder = async (id: string): Promise<PurchaseOrder | null> => {
    await connectionPromise;
    if (!id || typeof id !== 'string') {
        console.error("getPurchaseOrder called with an invalid ID:", id);
        return null;
    }
    const poDoc = doc(db, 'purchaseOrders', id);
    const docSnap = await getDoc(poDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};


export const updatePurchaseOrder = async (id: string, po: Partial<Omit<PurchaseOrder, 'id'>>): Promise<void> => {
    await connectionPromise;
    if (!id) return;
    const poDoc = doc(db, 'purchaseOrders', id);
    await updateDoc(poDoc, po);
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    await connectionPromise;
    if (!id) return;
    const poDoc = doc(db, 'purchaseOrders', id);
    await deleteDoc(poDoc);
};
