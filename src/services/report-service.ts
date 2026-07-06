import { getFirebase } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
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
  FirestoreDataConverter
} from 'firebase/firestore';
import type { Report } from '@/lib/types';

/**
 * Firestore data converter for the Report type.
 * Handles the mapping between Firestore documents and application objects.
 */
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
      product: {
        id: data.product?.id || '',
        name: data.product?.name || '',
        materialCode: data.product?.materialCode || '',
        partyId: data.product?.partyId || '',
        partyName: data.product?.partyName || '',
        partyAddress: data.product?.partyAddress || '',
        rate: data.product?.rate || 0,
        specification: data.product?.specification || {},
        createdBy: data.product?.createdBy || '',
        createdAt: data.product?.createdAt || '',
      },
      date: data.date || new Date().toISOString(),
      createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
      testData: data.testData || {},
      printLog: data.printLog || [],
      createdBy: data.createdBy || '',
      lastModifiedBy: data.lastModifiedBy || null,
      lastModifiedAt: data.lastModifiedAt || null,
    };
  }
};

/**
 * Returns a reference to the reports collection with the type converter applied.
 */
const getReportsCollection = () => {
  const { db } = getFirebase();
  return collection(db, 'reports').withConverter(reportConverter);
};

/**
 * Fetches all reports.
 */
export const getReports = async (): Promise<Report[]> => {
  const snapshot = await getDocs(getReportsCollection());
  return snapshot.docs.map(doc => doc.data());
};

/**
 * Adds a new report and returns the generated ID.
 */
export const addReport = async (report: Omit<Report, 'id'>): Promise<string> => {
  const docRef = await addDoc(getReportsCollection(), report as WithFieldValue<Report>);
  return docRef.id;
};

/**
 * Listens for real-time updates to the reports collection.
 */
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

/**
 * Fetches a single report by ID.
 */
export const getReport = async (id: string): Promise<Report | null> => {
  if (!id || typeof id !== 'string') {
    console.error("getReport called with an invalid ID:", id);
    return null;
  }
  const reportDoc = doc(getReportsCollection(), id);
  const docSnap = await getDoc(reportDoc);
  return docSnap.exists() ? docSnap.data() : null;
};

/**
 * Fetches reports associated with a specific product ID.
 */
export const getReportsByProductId = async (productId: string): Promise<Report[]> => {
  if (!productId) return [];
  const q = query(getReportsCollection(), where("product.id", "==", productId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data());
};

/**
 * Fetches report serial numbers (optimized for next-serial generation).
 */
export const getReportsForSerial = async (): Promise<Pick<Report, 'serialNumber'>[]> => {
  const snapshot = await getDocs(getReportsCollection());
  return snapshot.docs.map(doc => ({ serialNumber: doc.data().serialNumber }));
};

/**
 * Updates an existing report.
 */
export const updateReport = async (
  id: string, 
  report: Partial<Omit<Report, 'id' | 'serialNumber' | 'date' | 'createdAt' | 'createdBy'>>
): Promise<void> => {
  if (!id) return;
  const reportDoc = doc(getReportsCollection(), id);
  
  const payload = {
    ...report,
    lastModifiedAt: new Date().toISOString(),
  };

  await updateDoc(reportDoc, payload);
};

/**
 * Deletes a report by ID.
 */
export const deleteReport = async (id: string): Promise<void> => {
  if (!id) return;
  const reportDoc = doc(getReportsCollection(), id);
  await deleteDoc(reportDoc);
};
