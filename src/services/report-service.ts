import { getFirebase } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  QueryDocumentSnapshot, 
  getDoc, 
  query, 
  where, 
  WithFieldValue,
  DocumentData,
  FirestoreDataConverter,
  setDoc
} from 'firebase/firestore';
import type { Report } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const reportConverter: FirestoreDataConverter<Report> = {
  toFirestore: (report: WithFieldValue<Report>): DocumentData => {
    return { ...report };
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot): Report => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      serialNumber: data.serialNumber || '',
      taxInvoiceNumber: data.taxInvoiceNumber || 'N/A',
      challanNumber: data.challanNumber || 'N/A',
      quantity: data.quantity || 'N/A',
      product: data.product || {},
      date: data.date || new Date().toISOString(),
      createdAt: data.createdAt || new Date().toISOString(),
      testData: data.testData || {},
      printLog: data.printLog || [],
      createdBy: data.createdBy || '',
      lastModifiedBy: data.lastModifiedBy || null,
      lastModifiedAt: data.lastModifiedAt || null,
      ownership: data.ownership || 'Both',
    };
  }
};

const getReportsCollection = () => {
  const { db } = getFirebase();
  return collection(db, 'reports').withConverter(reportConverter);
};

export const getReports = async (): Promise<Report[]> => {
  try {
    const snapshot = await getDocs(getReportsCollection());
    return snapshot.docs.map(doc => doc.data());
  } catch (error: any) {
    if (error.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'reports', operation: 'list' }));
    }
    throw error;
  }
};

export const addReport = async (report: Omit<Report, 'id'>): Promise<string> => {
  const docRef = doc(getReportsCollection());
  const payload = { ...report, id: docRef.id };
  setDoc(docRef, payload).catch(async (err: any) => {
    if (err.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'reports',
            operation: 'create',
            requestResourceData: payload,
        }));
    }
  });
  return docRef.id;
};

export const onReportsUpdate = (callback: (reports: Report[]) => void): () => void => {
  return onSnapshot(getReportsCollection(), 
    (snapshot) => {
      callback(snapshot.docs.map(doc => doc.data()));
    },
    async (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'reports', operation: 'list' }));
        }
    }
  );
};

export const getReport = async (id: string): Promise<Report | null> => {
  if (!id || typeof id !== 'string') return null;
  const reportDoc = doc(getReportsCollection(), id);
  try {
    const docSnap = await getDoc(reportDoc);
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error: any) {
    if (error.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: reportDoc.path, operation: 'get' }));
    }
    return null;
  }
};

export const getReportsByProductId = async (productId: string): Promise<Report[]> => {
  if (!productId) return [];
  const q = query(getReportsCollection(), where("product.id", "==", productId));
  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error: any) {
    if (error.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'reports', operation: 'list' }));
    }
    return [];
  }
};

export const getReportsForSerial = async (): Promise<Pick<Report, 'serialNumber'>[]> => {
  try {
    const snapshot = await getDocs(getReportsCollection());
    return snapshot.docs.map(doc => ({ serialNumber: doc.data().serialNumber }));
  } catch (error: any) {
    if (error.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'reports', operation: 'list' }));
    }
    return [];
  }
};

export const updateReport = async (id: string, report: Partial<Omit<Report, 'id'>>): Promise<void> => {
  if (!id) return;
  const reportDoc = doc(getReportsCollection(), id);
  const payload = { ...report, lastModifiedAt: new Date().toISOString() };
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

export const deleteReport = async (id: string): Promise<void> => {
  if (!id) return;
  const reportDoc = doc(getReportsCollection(), id);
  deleteDoc(reportDoc).catch(async (err: any) => {
    if (err.code === 'permission-denied') {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: reportDoc.path, operation: 'delete' }));
    }
  });
};