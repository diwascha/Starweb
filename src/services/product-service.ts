
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc } from 'firebase/firestore';
import type { Product, RateHistoryEntry } from '@/lib/types';

const productsCollection = collection(db, 'products');

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
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getProducts = async (): Promise<Product[]> => {
    const snapshot = await getDocs(productsCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addProduct = async (product: Omit<Product, 'id'>): Promise<string> => {
    const docRef = await addDoc(productsCollection, product);
    return docRef.id;
};

export const onProductsUpdate = (callback: (products: Product[]) => void): () => void => {
    return onSnapshot(productsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateProduct = async (id: string, productUpdate: Partial<Omit<Product, 'id'>>): Promise<void> => {
    const productDocRef = doc(db, 'products', id);
    const productDoc = await getDoc(productDocRef);
    if (!productDoc.exists()) {
        throw new Error("Product not found");
    }
    const existingProduct = fromFirestore(productDoc);
    
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
};


export const deleteProduct = async (id: string): Promise<void> => {
    const productDoc = doc(db, 'products', id);
    await deleteDoc(productDoc);
};
