
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc, query, where } from 'firebase/firestore';
import type { Report } from '@/lib/types';

const reportsCollection = collection(db, 'reports');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Report => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        serialNumber: data.serialNumber,
        taxInvoiceNumber: data.taxInvoiceNumber,
        challanNumber: data.challanNumber,
        quantity: data.quantity,
        product: data.product,
        date: data.date,
        testData: data.testData,
        printLog: data.printLog,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
};

// A dedicated function to handle single doc snapshot which might not be a QueryDocumentSnapshot
const fromDocSnapshot = (docSnap: DocumentData): Report => {
    const data = docSnap.data();
    return {
        id: docSnap.id,
        serialNumber: data.serialNumber,
        taxInvoiceNumber: data.taxInvoiceNumber,
        challanNumber: data.challanNumber,
        quantity: data.quantity,
        product: data.product,
        date: data.date,
        testData: data.testData,
        printLog: data.printLog,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
};


export const addReport = async (report: Omit<Report, 'id'>): Promise<string> => {
    const docRef = await addDoc(reportsCollection, report);
    return docRef.id;
};

export const getReports = async (): Promise<Report[]> => {
    const snapshot = await getDocs(reportsCollection);
    return snapshot.docs.map(fromFirestore);
};

export const getReport = async (id: string): Promise<Report | null> => {
    const reportDoc = doc(db, 'reports', id);
    const docSnap = await getDoc(reportDoc);
    if (docSnap.exists()) {
        return fromDocSnapshot(docSnap);
    } else {
        return null;
    }
};

export const getReportsByProductId = async (productId: string): Promise<Report[]> => {
    const q = query(reportsCollection, where("product.id", "==", productId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
}

export const updateReport = async (id: string, report: Partial<Omit<Report, 'id'>>): Promise<void> => {
    const reportDoc = doc(db, 'reports', id);
    await updateDoc(reportDoc, {
        ...report,
        product: {
            ...report.product,
            lastModifiedBy: report.product?.lastModifiedBy || null,
        }
    });
};

export const deleteReport = async (id: string): Promise<void> => {
    const reportDoc = doc(db, 'reports', id);
    await deleteDoc(reportDoc);
};
