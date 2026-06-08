
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc } from 'firebase/firestore';
import type { PurchaseOrder, PurchaseOrderVersion } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';

const getPurchaseOrdersCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PURCHASE_ORDERS);
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): PurchaseOrder => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        poNumber: String(data.poNumber || ''),
        poDate: data.poDate,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        companyName: String(data.companyName || ''),
        companyAddress: String(data.companyAddress || ''),
        panNumber: data.panNumber ? String(data.panNumber) : undefined,
        items: (data.items || []).map((item: any) => ({
            ...item,
            quantity: String(item.quantity || '0')
        })),
        amendments: data.amendments || [],
        versions: data.versions || [],
        status: data.status,
        isDraft: !!data.isDraft,
        deliveryDate: data.deliveryDate,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
    try {
        const snapshot = await getDocs(getPurchaseOrdersCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        logServiceError('getPurchaseOrders', error);
        throw error;
    }
};

export const addPurchaseOrder = async (po: Omit<PurchaseOrder, 'id'>): Promise<string> => {
    try {
        const now = createTimestamp();
        const docRef = await addDoc(getPurchaseOrdersCollection(), {
            ...po,
            createdAt: now,
            updatedAt: now,
        });
        return docRef.id;
    } catch (error) {
        logServiceError('addPurchaseOrder', error);
        throw error;
    }
};

export const onPurchaseOrdersUpdate = (callback: (purchaseOrders: PurchaseOrder[]) => void): () => void => {
    return onSnapshot(getPurchaseOrdersCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            logServiceError('onPurchaseOrdersUpdate', error);
        }
    );
};

export const getPurchaseOrder = async (id: string): Promise<PurchaseOrder | null> => {
    if (!id || typeof id !== 'string') return null;
    try {
        const poDoc = doc(getPurchaseOrdersCollection(), id);
        const docSnap = await getDoc(poDoc);
        if (docSnap.exists()) {
            return fromFirestore(docSnap);
        }
        return null;
    } catch (error) {
        logServiceError('getPurchaseOrder', error);
        return null;
    }
};

export const updatePurchaseOrder = async (id: string, poUpdate: Partial<Omit<PurchaseOrder, 'id'>>): Promise<void> => {
    if (!id) return;
    const poDocRef = doc(getPurchaseOrdersCollection(), id);
    
    try {
        const poSnap = await getDoc(poDocRef);
        if (poSnap.exists()) {
            const currentData = poSnap.data() as PurchaseOrder;
            const now = createTimestamp();
            
            const newVersion: PurchaseOrderVersion = {
                versionId: Date.now().toString(),
                replacedAt: now,
                replacedBy: poUpdate.lastModifiedBy || currentData.lastModifiedBy || 'System',
                data: {
                    poNumber: currentData.poNumber,
                    poDate: currentData.poDate,
                    items: currentData.items,
                    companyName: currentData.companyName,
                    companyAddress: currentData.companyAddress,
                    panNumber: currentData.panNumber || '',
                    status: currentData.status,
                    deliveryDate: currentData.deliveryDate || '',
                    amendments: currentData.amendments || [],
                }
            };

            const updatedVersions = [...(currentData.versions || []), newVersion];
            
            await updateDoc(poDocRef, {
                ...poUpdate,
                versions: updatedVersions,
                updatedAt: now
            });
        }
    } catch (error) {
        logServiceError('updatePurchaseOrder', error);
        throw error;
    }
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    if (!id) return;
    try {
        const poDoc = doc(getPurchaseOrdersCollection(), id);
        await deleteDoc(poDoc);
    } catch (error) {
        logServiceError('deletePurchaseOrder', error);
        throw error;
    }
};
