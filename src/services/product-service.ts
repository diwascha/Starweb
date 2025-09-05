
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Product } from '@/lib/types';

const productsCollection = collection(db, 'products');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Product => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        materialCode: data.materialCode,
        companyName: data.companyName,
        address: data.address,
        specification: data.specification,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const addProduct = async (product: Omit<Product, 'id'>): Promise<string> => {
    const docRef = await addDoc(productsCollection, product);
    return docRef.id;
};

export const onProductsUpdate = (callback: (products: Product[]) => void): () => void => {
    return onSnapshot(productsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateProduct = async (id: string, product: Partial<Omit<Product, 'id'>>): Promise<void> => {
    const productDoc = doc(db, 'products', id);
    await updateDoc(productDoc, product);
};

export const deleteProduct = async (id: string): Promise<void> => {
    const productDoc = doc(db, 'products', id);
    await deleteDoc(productDoc);
};
