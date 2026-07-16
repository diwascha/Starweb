/**
 * @fileOverview Purchase Order service.
 * Refactored for contextual error handling and non-blocking writes.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc, setDoc, getDocs } from 'firebase/firestore';
import type { PurchaseOrder, PurchaseOrderVersion } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { logAudit } from './log-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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
        partyId: data.partyId || '',
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({ 
            path: COLLECTIONS.PURCHASE_ORDERS, 
            operation: 'list' 
        } satisfies SecurityRuleContext));
        throw error;
    }
};

export const addPurchaseOrder = async (po: Omit<PurchaseOrder, 'id'>): Promise<string> => {
    const docRef = doc(getPurchaseOrdersCollection());
    const id = docRef.id;
    const now = createTimestamp();
    
    const payload = {
        ...po,
        createdAt: now,
        updatedAt: now,
    };

    // Non-blocking persistence
    setDoc(docRef, payload).then(() => {
        logAudit(`New Purchase Order Created: ${po.poNumber}`, 'Procurement', { status: po.status });
    }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: payload,
        } satisfies SecurityRuleContext));
    });

    return id;
};

export const onPurchaseOrdersUpdate = (callback: (purchaseOrders: PurchaseOrder[]) => void): () => void => {
    return onSnapshot(getPurchaseOrdersCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                path: COLLECTIONS.PURCHASE_ORDERS, 
                operation: 'list' 
            } satisfies SecurityRuleContext));
        }
    );
};

export const getPurchaseOrder = async (id: string): Promise<PurchaseOrder | null> => {
    if (!id || typeof id !== 'string') return null;
    const poDoc = doc(getPurchaseOrdersCollection(), id);
    try {
        const docSnap = await getDoc(poDoc);
        if (docSnap.exists()) {
            return fromFirestore(docSnap);
        }
        return null;
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ 
            path: poDoc.path, 
            operation: 'get' 
        } satisfies SecurityRuleContext));
        return null;
    }
};

export const updatePurchaseOrder = async (id: string, poUpdate: Partial<Omit<PurchaseOrder, 'id'>>): Promise<void> => {
    if (!id) return;
    const poDocRef = doc(getPurchaseOrdersCollection(), id);
    
    // We fetch the current state once to build the version history
    getDoc(poDocRef).then(async (poSnap) => {
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
            const payload = { ...poUpdate, versions: updatedVersions, updatedAt: now };

            // Non-blocking update
            updateDoc(poDocRef, payload).then(() => {
                logAudit(`Purchase Order Modified: ${currentData.poNumber}`, 'Procurement', { id, isAmendment: !currentData.isDraft });
            }).catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: poDocRef.path,
                    operation: 'update',
                    requestResourceData: payload,
                } satisfies SecurityRuleContext));
            });
        }
    });
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    if (!id) return;
    const poDoc = doc(getPurchaseOrdersCollection(), id);
    
    // Non-blocking delete
    deleteDoc(poDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ 
            path: poDoc.path, 
            operation: 'delete' 
        } satisfies SecurityRuleContext));
    });
};