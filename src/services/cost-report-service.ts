import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, orderBy, deleteDoc, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import type { CostReport, QuotationStatus } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { updateDeal } from './deal-service';
import { reserveNextNumber } from './number-reservation-service';

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
        ownership: data.ownership || 'Shivam',
        status: data.status || 'Draft',
        dealId: data.dealId,
        validUntilBS: data.validUntilBS,
        remarks: data.remarks,
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
    // doc() mints the id locally; setDoc writes without blocking on the
    // server, so saving a quotation works offline like everything else.
    const docRef = doc(getCostReportsCollection());
    reportWriteFailure(
        setDoc(docRef, payload),
        { path: 'costReports', operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const updateCostReport = async (id: string, report: Partial<Omit<CostReport, 'id'>>): Promise<void> => {
    if (!id) return;
    const reportDoc = doc(getCostReportsCollection(), id);
    const payload = {
        ...report,
        lastModifiedAt: new Date().toISOString(),
    };
    reportWriteFailure(
        updateDoc(reportDoc, payload),
        { path: reportDoc.path, operation: 'update', requestResourceData: payload }
    );
};

export const updateQuotationStatus = async (id: string, status: QuotationStatus, modifiedBy: string) => {
    const docRef = doc(getCostReportsCollection(), id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    
    const data = docSnap.data() as CostReport;
    const statusPayload = {
        status,
        lastModifiedBy: modifiedBy,
        lastModifiedAt: new Date().toISOString(),
    };
    reportWriteFailure(
        updateDoc(docRef, statusPayload),
        { path: docRef.path, operation: 'update', requestResourceData: statusPayload }
    );

    // Deal Sync Logic
    if (status === 'Sent' && data.dealId) {
        try {
            await updateDeal(data.dealId, { stage: 'Quoted', lastModifiedBy: modifiedBy });
        } catch (e) {
            console.warn("Linked deal update failed:", e);
        }
    }
};

export const deleteCostReport = async (id: string): Promise<void> => {
    if (!id) return;
    const reportDoc = doc(getCostReportsCollection(), id);
    reportWriteFailure(deleteDoc(reportDoc), { path: reportDoc.path, operation: 'delete' });
};

/**
 * The quotation number a form SHOWS while it is being filled in. A preview
 * only - two people can see the same suggestion at once. The number that
 * actually goes on the saved quotation is claimed by reserveCostReportNumber.
 */
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

/**
 * Claim the next quotation number atomically at save time.
 *
 * Quotation numbers are not driven by the Settings numbering rules - they have
 * always been a plain CR-0001 sequence - so this reserves against the counter
 * directly rather than going through reserveNumberFor. Four-digit padding is
 * preserved deliberately: changing it would make new quotations sort and read
 * differently from every one already issued.
 */
export const reserveCostReportNumber = async (
    reports: Pick<CostReport, 'reportNumber'>[]
): Promise<string> =>
    reserveNextNumber('costReport', 'CR-', reports.map(r => r.reportNumber), 1, 4);
