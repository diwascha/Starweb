import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc } from 'firebase/firestore';
import type { PurchaseOrder, PurchaseOrderVersion } from '@/lib/types';

const getPurchaseOrdersCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'purchaseOrders');
}

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
        panNumber: data.panNumber,
        items: data.items,
        amendments: data.amendments,
        versions: data.versions || [],
        status: data.status,
        isDraft: data.isDraft ?? false, // Default to false if not present
        deliveryDate: data.deliveryDate,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
    const snapshot = await getDocs(getPurchaseOrdersCollection());
    return snapshot.docs.map(fromFirestore);
};

export const addPurchaseOrder = async (po: Omit<PurchaseOrder, 'id'>): Promise<string> => {
    const docRef = await addDoc(getPurchaseOrdersCollection(), {
        ...po,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onPurchaseOrdersUpdate = (callback: (purchaseOrders: PurchaseOrder[]) => void): () => void => {
    return onSnapshot(getPurchaseOrdersCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Purchase Orders):", error.message, error);
        }
    );
};

export const getPurchaseOrder = async (id: string): Promise<PurchaseOrder | null> => {
    if (!id || typeof id !== 'string') {
        console.error("getPurchaseOrder called with an invalid ID:", id);
        return null;
    }
    const poDoc = doc(getPurchaseOrdersCollection(), id);
    const docSnap = await getDoc(poDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};


export const updatePurchaseOrder = async (id: string, poUpdate: Partial<Omit<PurchaseOrder, 'id'>>): Promise<void> => {
    if (!id) return;
    const poDocRef = doc(getPurchaseOrdersCollection(), id);
    
    // Snapshot current state for versioning
    const poSnap = await getDoc(poDocRef);
    if (poSnap.exists()) {
        const currentData = poSnap.data() as PurchaseOrder;
        
        // Don't version if it's currently a draft and stays a draft? 
        // No, let's capture all meaningful updates.
        
        const newVersion: PurchaseOrderVersion = {
            versionId: Date.now().toString(),
            replacedAt: new Date().toISOString(),
            replacedBy: poUpdate.lastModifiedBy || currentData.lastModifiedBy || 'System',
            data: {
                poDate: currentData.poDate,
                items: currentData.items,
                companyName: currentData.companyName,
                companyAddress: currentData.companyAddress,
                panNumber: currentData.panNumber,
                status: currentData.status,
            }
        };

        const updatedVersions = [...(currentData.versions || []), newVersion];
        
        updateDoc(poDocRef, {
            ...poUpdate,
            versions: updatedVersions,
            updatedAt: new Date().toISOString()
        }).catch(err => {
            console.error("Failed to update PO with version history:", err);
        });
    }
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    if (!id) return;
    const poDoc = doc(getPurchaseOrdersCollection(), id);
    await deleteDoc(poDoc);
};
