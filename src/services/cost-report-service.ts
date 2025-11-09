
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, orderBy, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { CostReport } from '@/lib/types';

const costReportsCollection = collection(db, 'costReports');

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
        items: data.items,
        totalCost: data.totalCost,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
};

export const getCostReports = async (): Promise<CostReport[]> => {
    const q = query(costReportsCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
};

export const onCostReportsUpdate = (callback: (reports: CostReport[]) => void): () => void => {
    const q = query(costReportsCollection, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getCostReport = async (id: string): Promise<CostReport | null> => {
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(db, 'costReports', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return fromFirestore(docSnap as QueryDocumentSnapshot<DocumentData>);
    }
    return null;
}

export const addCostReport = async (report: Omit<CostReport, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await addDoc(costReportsCollection, {
        ...report,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const updateCostReport = async (id: string, report: Partial<Omit<CostReport, 'id'>>): Promise<void> => {
    if (!id) return;
    const reportDoc = doc(db, 'costReports', id);
    await updateDoc(reportDoc, {
        ...report,
        lastModifiedAt: new Date().toISOString(),
    });
};


export const deleteCostReport = async (id: string): Promise<void> => {
    if (!id) return;
    await deleteDoc(doc(db, 'costReports', id));
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
