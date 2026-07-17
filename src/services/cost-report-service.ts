import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, orderBy, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { CostReport } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCostReportsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'costReports');
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): CostReport => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        reportNumber: data.reportNumber,
        reportDate: data.reportDate,
        partyId: data.partyId,
        partyName: data.partyName,
        kraftPaperCosts: data.kraftPaperCosts,
        virginPaperCost: data.virginPaperCost,
        conversionCost: data.conversionCost,
        accessoryConversionCost: Number(data.accessoryConversionCost) || 0,
        transportCost: data.transportCost,
        transportCostType: data.transportCostType,
        items: data.items,
        totalCost: data.totalCost,
        termsAndConditions: data.termsAndConditions || [],
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
};

export const getCostReports = async (): Promise<CostReport[]> => {
    const q = query(getCostReportsCollection(), orderBy('createdAt', 'desc'));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'costReports',
                operation: 'list',
            }));
        }
        throw error;
    }
};

export const onCostReportsUpdate = (callback: (reports: CostReport[]) => void): () => void => {
    const q = query(getCostReportsCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'costReports',
                    operation: 'list',
                }));
            }
        }
    );
};

export const getCostReport = async (id: string): Promise<CostReport | null> => {
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(getCostReportsCollection(), id);
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
}

export const addCostReport = async (report: Omit<CostReport, 'id' | 'createdAt'>): Promise<string> => {
    const payload = {
        ...report,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getCostReportsCollection());
    addDoc(getCostReportsCollection(), payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'costReports',
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
    return docRef.id;
};

export const updateCostReport = async (id: string, report: Partial<Omit<CostReport, 'id'>>): Promise<void> => {
    if (!id) return;
    const reportDoc = doc(getCostReportsCollection(), id);
    const payload = {
        ...report,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(reportDoc, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: reportDoc.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};


export const deleteCostReport = async (id: string): Promise<void> => {
    if (!id) return;
    const reportDoc = doc(getCostReportsCollection(), id);
    deleteDoc(reportDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: reportDoc.path,
                operation: 'delete',
            }));
        }
    });
};

export const generateNextCostReportNumber = async (reports: Pick<CostReport, 'reportNumber'>[]): Promise<string> => {
    const prefix = 'CR-';
    let maxNumber = 0;
    reports.forEach(report => {
        if (report.reportNumber && report.reportNumber.startsWith(prefix)) {
            const numPart = parseInt(report.reportNumber.substring(prefix.length), 10);
            if (!isNaN(numPart) && numPart > maxNumber) {
                maxNumber = numPart;
            }
        }
    });
    const nextNumber = maxNumber + 1;
    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
};