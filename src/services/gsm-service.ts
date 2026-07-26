
'use client';

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    query, 
    orderBy 
} from 'firebase/firestore';
import type { GsmReport } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getGsmCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.GSM_REPORTS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): GsmReport => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo || 'GSM-LEGACY',
        date: data.date,
        vendorId: data.vendorId || '',
        vendorName: data.vendorName || '',
        reelNumber: data.reelNumber || '',
        weight: Number(data.weight) || 0,
        length: Number(data.length) || 0,
        width: Number(data.width) || 0,
        unit: (data.unit || 'cm') as 'cm' | 'in',
        gsm: Number(data.gsm) || 0,
        createdBy: data.createdBy || 'System',
        createdAt: data.createdAt || new Date().toISOString(),
        ownership: data.ownership || 'Both',
    };
};

export const onGsmReportsUpdate = (callback: (reports: GsmReport[]) => void): () => void => {
    const q = query(getGsmCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                    path: COLLECTIONS.GSM_REPORTS, 
                    operation: 'list' 
                }));
            }
        }
    );
};

export const addGsmReport = async (report: Omit<GsmReport, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = doc(getGsmCollection());
    const payload = { 
        ...report, 
        createdAt: new Date().toISOString() 
    };
    
    setDoc(docRef, payload).catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.GSM_REPORTS,
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
    return docRef.id;
};

export const updateGsmReport = async (id: string, updates: Partial<Omit<GsmReport, 'id'>>): Promise<void> => {
    const reportRef = doc(getGsmCollection(), id);
    const payload = { ...updates, lastModifiedAt: new Date().toISOString() };
    
    updateDoc(reportRef, payload).catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: reportRef.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

export const deleteGsmReport = async (id: string): Promise<void> => {
    const reportRef = doc(getGsmCollection(), id);
    deleteDoc(reportRef).catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                path: reportRef.path, 
                operation: 'delete' 
            }));
        }
    });
};
