import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc } from 'firebase/firestore';
import type { Product, RateHistoryEntry } from '@/lib/types';
import { logServiceError, logAudit } from '@/lib/service-utils';

const getProductsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'products');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Product => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        materialCode: data.materialCode,
        partyId: data.partyId,
        partyName: data.partyName,
        partyAddress: data.partyAddress,
        rate: data.rate,
        rateHistory: data.rateHistory || [],
        specification: data.specification,
        accessories: data.accessories,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getProducts = async (): Promise<Product[]> => {
    const snapshot = await getDocs(getProductsCollection());
    return snapshot.docs.map(fromFirestore);
};

export const addProduct = async (product: Omit<Product, 'id'>): Promise<string> => {
    const docRef = await addDoc(getProductsCollection(), product);
    return docRef.id;
};

export const onProductsUpdate = (callback: (products: Product[]) => void): () => void => {
    return onSnapshot(getProductsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            logServiceError("onProductsUpdate", error);
        }
    );
};

export const updateProduct = async (id: string, productUpdate: Partial<Omit<Product, 'id'>>): Promise<void> => {
    const productDocRef = doc(getProductsCollection(), id);
    const productDoc = await getDoc(productDocRef);
    if (!productDoc.exists()) {
        throw new Error("Product not found");
    }
    const existingProduct = fromFirestore(productDoc as QueryDocumentSnapshot<DocumentData>);
    
    const updates: Partial<Product> = { ...productUpdate };

    // If the rate is being updated, log the old one to history
    if (productUpdate.rate !== undefined && existingProduct.rate !== undefined && productUpdate.rate !== existingProduct.rate) {
        const newHistoryEntry: RateHistoryEntry = {
            rate: existingProduct.rate,
            date: existingProduct.lastModifiedAt || existingProduct.createdAt,
            setBy: existingProduct.lastModifiedBy || existingProduct.createdBy,
        };
        updates.rateHistory = [...(existingProduct.rateHistory || []), newHistoryEntry];
    }
    
    await updateDoc(productDocRef, {
        ...updates,
        lastModifiedAt: new Date().toISOString(),
    });

    logAudit(`Product Record Updated: ${existingProduct.name}`, 'Reports', {
        id,
        changes: productUpdate
    });
};


export const deleteProduct = async (id: string): Promise<void> => {
    const productDoc = doc(getProductsCollection(), id);
    const snap = await getDoc(productDoc);
    const name = snap.exists() ? snap.data().name : id;
    
    await deleteDoc(productDoc);
    logAudit(`Product Permanently Deleted: ${name}`, 'Reports', { id });
};
