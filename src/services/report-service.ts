
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc, query, where, DocumentSnapshot } from 'firebase/firestore';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc, query, where, DocumentSnapshot, WithFieldValue } from 'firebase/firestore';
import type { Report } from '@/lib/types';

const getReportsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'reports').withConverter<Report>({
        toFirestore: (report: Omit<Report, 'id'>) => {
            return {
                ...report,
            };
        },
        fromFirestore: (snapshot: QueryDocumentSnapshot): Report => {
            const data = snapshot.data();
            return {
                id: snapshot.id,
                serialNumber: data.serialNumber,
                taxInvoiceNumber: data.taxInvoiceNumber,
                challanNumber: data.challanNumber,
                quantity: data.quantity,
                product: {
                    id: data.product?.id ?? '',
                    name: data.product?.name ?? '',
                    partyName: data.product?.partyName ?? '',
                    rate: data.product?.rate ?? 0,
                    specification: data.product?.specification ?? {},
                },
                date: data.date,
                createdAt: data.createdAt,
                createdAt: data.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
                testData: data.testData,
                printLog: data.printLog,
                createdBy: data.createdBy,
                lastModifiedBy: data.lastModifiedBy,
                lastModifiedAt: data.lastModifiedAt,
            };
        }
    });
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Report => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        serialNumber: data.serialNumber,
        taxInvoiceNumber: data.taxInvoiceNumber,
        challanNumber: data.challanNumber,
        quantity: data.quantity,
        product: {
            id: data.product?.id ?? '',
            name: data.product?.name ?? '',
            partyName: data.product?.partyName ?? '',
            rate: data.product?.rate ?? 0,
            specification: data.product?.specification ?? {},
        },
        date: data.date,
        createdAt: data.createdAt, // This will be a Timestamp object
        createdAt: data.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
        testData: data.testData,
        printLog: data.printLog,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

const fromDocSnapshot = (docSnap: DocumentSnapshot<DocumentData>): Report => {
    const data = docSnap.data();
    return {
        id: docSnap.id,
        serialNumber: data.serialNumber,
        taxInvoiceNumber: data.taxInvoiceNumber,
        challanNumber: data.challanNumber,
        quantity: data.quantity,
        product: {
            id: data.product?.id ?? '',
            name: data.product?.name ?? '',
            partyName: data.product?.partyName ?? '',
            rate: data.product?.rate ?? 0,
            specification: data.product?.specification ?? {},
        },
        date: data.date,
        createdAt: data.createdAt, // This will be a Timestamp object
        createdAt: data.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
        testData: data.testData,
        printLog: data.printLog,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

export const getReports = async (): Promise<Report[]> => {
    const snapshot = await getDocs(getReportsCollection());
    return snapshot.docs.map(doc => doc.data());
};

export const addReport = async (report: Omit<Report, 'id'>): Promise<string> => {
    const docRef = await addDoc(getReportsCollection(), report);
    return docRef.id;
};

export const onReportsUpdate = (callback: (reports: Report[]) => void): () => void => {
    return onSnapshot(getReportsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(doc => doc.data()));
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Reports):", error.message, error);
        }
    );
};

export const getReport = async (id: string): Promise<Report | null> => {
    if (!id || typeof id !== 'string') {
        console.error("getReport called with an invalid ID:", id);
        return null;
    }
    const reportDoc = doc(getReportsCollection(), id);
    const docSnap = await getDoc(reportDoc);
    if (docSnap.exists()) {
        return docSnap.data();
    } else {
        return null;
    }
};

export const getReportsByProductId = async (productId: string): Promise<Report[]> => {
    if (!productId) return [];
    const q = query(getReportsCollection(), where("product.id", "==", productId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export const getReportsForSerial = async (): Promise<Pick<Report, 'serialNumber'>[]> => {
    const snapshot = await getDocs(getReportsCollection());
    return snapshot.docs.map(doc => ({ serialNumber: doc.data().serialNumber }));
};


export const updateReport = async (id: string, report: Partial<Omit<Report, 'id' | 'serialNumber' | 'date' | 'createdAt' | 'createdBy'>>): Promise<void> => {
    if (!id) return;
    const reportDoc = doc(getReportsCollection(), id);
    await updateDoc(reportDoc, {
    const payload: WithFieldValue<Partial<Report>> = {
        ...report,
        lastModifiedAt: new Date().toISOString(),
    });
    };
    await updateDoc(reportDoc, payload);
};

export const deleteReport = async (id: string): Promise<void> => {
    if (!id) return;
    const reportDoc = doc(getReportsCollection(), id);
    await deleteDoc(reportDoc);
};
