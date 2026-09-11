/**
 * @fileOverview Purchase Order service.
 * Standardized for contextual error handling and non-blocking writes.
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    getDoc, 
    setDoc
} from 'firebase/firestore';
import type { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderVersion } from '@/lib/types';
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
        status: data.status || 'Draft',
        isDraft: !!data.isDraft,
        deliveryDate: data.deliveryDate,
        shippedDate: data.shippedDate,
        remarks: data.remarks,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
        ownership: data.ownership || 'Both',
    };
}

export const addPurchaseOrder = async (po: Omit<PurchaseOrder, 'id'>): Promise<string> => {
    const docRef = doc(getPurchaseOrdersCollection());
    const id = docRef.id;
    const now = createTimestamp();
    
    const payload = {
        ...po,
        createdAt: now,
        updatedAt: now,
    };

    setDoc(docRef, payload).then(() => {
        logAudit(`New Purchase Order Created: ${po.poNumber}`, 'Procurement', { status: po.status });
    }).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'create',
                requestResourceData: payload,
            } satisfies SecurityRuleContext));
        }
    });

    return id;
};

export const onPurchaseOrdersUpdate = (callback: (purchaseOrders: PurchaseOrder[]) => void): () => void => {
    return onSnapshot(getPurchaseOrdersCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                    path: COLLECTIONS.PURCHASE_ORDERS, 
                    operation: 'list' 
                } satisfies SecurityRuleContext));
            }
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
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                path: poDoc.path, 
                operation: 'get' 
            } satisfies SecurityRuleContext));
        }
        return null;
    }
};

/**
 * Purchase orders a version snapshot is worth keeping for.
 *
 * Only a change to the ORDER ITSELF is worth a snapshot. A status click, a
 * delivery date or a remark is already recorded in `amendments`, and
 * snapshotting the whole document for one of those was the main reason these
 * documents grew without bound.
 */
const CONTENT_FIELDS: (keyof Omit<PurchaseOrder, 'id'>)[] = [
    'items', 'poNumber', 'poDate', 'partyId', 'companyName', 'companyAddress', 'panNumber',
];

/** Once an order is delivered or cancelled it is finished, and the working
 *  history of how it got drafted is of no further use. The amendment log -
 *  which is what an auditor actually asks for - is kept either way. */
const TERMINAL_STATUSES: PurchaseOrderStatus[] = ['Delivered', 'Canceled'];

/**
 * How many snapshots to keep while an order is still live. A rolling window
 * bounds the document no matter how many times a draft is revised; without
 * one, a heavily-edited PO eventually exceeds Firestore's 1 MiB document
 * limit and every further write fails.
 */
const MAX_VERSIONS = 20;

export const updatePurchaseOrder = async (id: string, poUpdate: Partial<Omit<PurchaseOrder, 'id'>>): Promise<void> => {
    if (!id) return;
    const poDocRef = doc(getPurchaseOrdersCollection(), id);

    const poSnap = await getDoc(poDocRef);
    if (!poSnap.exists()) {
        // Previously this returned quietly, so the caller reported success for
        // a write that never happened.
        throw new Error(`Purchase order ${id} no longer exists.`);
    }

    const currentData = poSnap.data() as PurchaseOrder;
    const now = createTimestamp();

    const nextStatus = (poUpdate.status || currentData.status) as PurchaseOrderStatus;
    const isTerminal = TERMINAL_STATUSES.includes(nextStatus);
    const changesContent = CONTENT_FIELDS.some(f => poUpdate[f] !== undefined);

    let updatedVersions = currentData.versions || [];

    if (isTerminal) {
        updatedVersions = [];
    } else if (changesContent) {
        const newVersion: PurchaseOrderVersion = {
            // Date.now() alone collides when two updates land in the same
            // millisecond, which silently produced duplicate version ids.
            versionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
                shippedDate: currentData.shippedDate || '',
                remarks: currentData.remarks || '',
                // `amendments` is deliberately NOT copied in here. It lives on
                // the document already, and duplicating the whole log into
                // every snapshot made growth quadratic rather than linear.
            },
        };
        updatedVersions = [...updatedVersions, newVersion].slice(-MAX_VERSIONS);
    }

    const payload = { ...poUpdate, versions: updatedVersions, updatedAt: now };

    try {
        await updateDoc(poDocRef, payload);
        logAudit(`Purchase Order Modified: ${currentData.poNumber}`, 'Procurement', { id, isAmendment: !currentData.isDraft });
    } catch (err: any) {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: poDocRef.path,
                operation: 'update',
                requestResourceData: payload,
            } satisfies SecurityRuleContext));
        }
        // Rethrow so the caller can tell the user it failed instead of
        // toasting success over a write that didn't land.
        throw err;
    }
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    if (!id) return;
    const poDoc = doc(getPurchaseOrdersCollection(), id);
    
    deleteDoc(poDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                path: poDoc.path, 
                operation: 'delete' 
            } satisfies SecurityRuleContext));
        }
    });
};