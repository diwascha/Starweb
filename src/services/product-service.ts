import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { deepStripUndefined } from '@/lib/service-utils';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc, setDoc } from 'firebase/firestore';
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
        // Layer stack saved by the Box Designer; dropping it here meant an
        // edited product reopened with its layers gone.
        layers: data.layers,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
        ownership: data.ownership || 'Shivam',
    };
}

export const addProduct = async (product: Omit<Product, 'id'>): Promise<string> => {
    const docRef = doc(getProductsCollection());
    const { id: _ignored, ...rest } = product as any;
    const payload = deepStripUndefined(rest);
    reportWriteFailure(
        setDoc(docRef, payload),
        { path: 'products', operation: 'create', requestResourceData: product }
    );
    return docRef.id;
};

export const onProductsUpdate = (callback: (products: Product[]) => void): () => void => {
    return onSnapshot(getProductsCollection(), 
        (snapshot) => {
            const products = snapshot.docs.map(fromFirestore);
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
    // Read from the local cache when offline, so editing still works there.
    const productDoc = await getDoc(productDocRef);
    if (!productDoc.exists()) throw new Error('Product not found');
    const existingProduct = fromFirestore(productDoc as QueryDocumentSnapshot<DocumentData>);

    const { id: _ignored, ...updates } = productUpdate as Partial<Product>;

    if (productUpdate.rate !== undefined && existingProduct.rate !== undefined && productUpdate.rate !== existingProduct.rate) {
        const newHistoryEntry: RateHistoryEntry = {
            rate: existingProduct.rate,
            date: existingProduct.lastModifiedAt || existingProduct.createdAt,
            setBy: existingProduct.lastModifiedBy || existingProduct.createdBy,
        };
        updates.rateHistory = [...(existingProduct.rateHistory || []), newHistoryEntry];
    }

    const payload = deepStripUndefined({
        ...updates,
        lastModifiedAt: new Date().toISOString(),
    });

    reportWriteFailure(
        updateDoc(productDocRef, payload).then(() => {
            logAudit(`Product Record Updated: ${existingProduct.name}`, 'Reports', {
                id,
                changes: payload
            });
        }),
        { path: productDocRef.path, operation: 'update', requestResourceData: payload }
    );
};


export const deleteProduct = async (id: string): Promise<void> => {
    const productDoc = doc(getProductsCollection(), id);
    reportWriteFailure(
        deleteDoc(productDoc),
        { path: productDoc.path, operation: 'delete' }
    );
};