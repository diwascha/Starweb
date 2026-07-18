import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc, setDoc } from 'firebase/firestore';
import type { Product, RateHistoryEntry } from '@/lib/types';
import { logAudit } from './log-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
        ownership: data.ownership || 'Shivam',
    };
}

// Memory cache to avoid repeated JSON parsing from sessionStorage
const productCache = new Map<string, { data: Product[]; timestamp: number }>();

export const getProducts = async (useCache = false): Promise<Product[]> => {
    if (useCache) {
        const cached = productCache.get('products');
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached.data;
        }
    }
    
    try {
        const snapshot = await getDocs(getProductsCollection());
        const products = snapshot.docs.map(fromFirestore);
        productCache.set('products', { data: products, timestamp: Date.now() });
        return products;
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'products',
                operation: 'list',
            }));
        }
        throw error;
    }
};

export const addProduct = async (product: Omit<Product, 'id'>): Promise<string> => {
    const docRef = doc(getProductsCollection());
    const payload = { ...product };
    setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'products',
                operation: 'create',
                requestResourceData: product,
            }));
        }
    });
    return docRef.id;
};

export const onProductsUpdate = (callback: (products: Product[]) => void): () => void => {
    return onSnapshot(getProductsCollection(), 
        (snapshot) => {
            const products = snapshot.docs.map(fromFirestore);
            productCache.set('products', { data: products, timestamp: Date.now() });
            callback(products);
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'products',
                    operation: 'list',
                }));
            }
        }
    );
};

export const updateProduct = async (id: string, productUpdate: Partial<Omit<Product, 'id'>>): Promise<void> => {
    const productDocRef = doc(getProductsCollection(), id);
    getDoc(productDocRef).then(async (productDoc) => {
        if (!productDoc.exists()) return;
        const existingProduct = fromFirestore(productDoc as QueryDocumentSnapshot<DocumentData>);
        
        const updates: Partial<Product> = { ...productUpdate };

        if (productUpdate.rate !== undefined && existingProduct.rate !== undefined && productUpdate.rate !== existingProduct.rate) {
            const newHistoryEntry: RateHistoryEntry = {
                rate: existingProduct.rate,
                date: existingProduct.lastModifiedAt || existingProduct.createdAt,
                setBy: existingProduct.lastModifiedBy || existingProduct.createdBy,
            };
            updates.rateHistory = [...(existingProduct.rateHistory || []), newHistoryEntry];
        }
        
        const payload = {
            ...updates,
            lastModifiedAt: new Date().toISOString(),
        };

        updateDoc(productDocRef, payload).then(() => {
            logAudit(`Product Record Updated: ${existingProduct.name}`, 'Reports', {
                id,
                changes: productUpdate
            });
        }).catch(async (err: any) => {
            if (err.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: productDocRef.path,
                    operation: 'update',
                    requestResourceData: payload,
                }));
            }
        });
    });
};


export const deleteProduct = async (id: string): Promise<void> => {
    const productDoc = doc(getProductsCollection(), id);
    deleteDoc(productDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: productDoc.path,
                operation: 'delete',
            }));
        }
    });
};

export const getProduct = async (id: string): Promise<Product | null> => {
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(getProductsCollection(), id);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return fromFirestore(docSnap as QueryDocumentSnapshot<DocumentData>);
        }
        return null;
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'get',
            }));
        }
        return null;
    }
};