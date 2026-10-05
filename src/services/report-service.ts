import { deepStripUndefined } from '@/lib/service-utils';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, doc, deleteDoc, onSnapshot, QueryDocumentSnapshot, getDoc, WithFieldValue, DocumentData, FirestoreDataConverter, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import type { Report, ProductSpecification, PrintLogEntry } from '@/lib/types';
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
      kind: data.kind === 'coc' ? 'coc' : 'test',
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

export const addReport = async (report: Omit<Report, 'id'>): Promise<string> => {
  const docRef = doc(getReportsCollection());
  const payload = deepStripUndefined({ ...report, id: docRef.id });
  reportWriteFailure(
      setDoc(docRef, payload),
      { path: 'reports', operation: 'create', requestResourceData: payload }
  );
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
  if (!id || typeof id !== 'string' || id.includes('/')) return null;
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

export const deleteReport = async (id: string): Promise<void> => {
  if (!id) return;
  const reportDoc = doc(getReportsCollection(), id);
  reportWriteFailure(
      deleteDoc(reportDoc),
      { path: reportDoc.path, operation: 'delete' }
  );
};

/** Saves changes to an existing report (number, product snapshot and audit trail are kept). */
export const updateReport = async (id: string, changes: Partial<Omit<Report, 'id' | 'serialNumber' | 'createdAt' | 'createdBy'>>): Promise<void> => {
  if (!id) return;
  const { db } = getFirebase();
  const payload = deepStripUndefined({ ...changes, lastModifiedAt: new Date().toISOString() });
  await updateDoc(doc(db, 'reports', id), payload);
};

/**
 * Records that a report was printed or exported (feeds the dashboard's Print
 * Count). Best effort: a viewer without edit rights can still print.
 */
export const logReportPrint = async (id: string, entry: PrintLogEntry): Promise<void> => {
  if (!id) return;
  const { db } = getFirebase();
  try {
    await updateDoc(doc(db, 'reports', id), { printLog: arrayUnion(entry) });
  } catch {
    /* not allowed or offline - printing still works */
  }
};

// Product fields that are costing or construction inputs, not QC tests.
// The parameters a test report lists, in the order of the paper format in use
// (Ply, GSM, Staple Width, ... Load). Costing fields (paper layers, wastage)
// are not tested and never appear.
export const TEST_PARAMETERS: (keyof ProductSpecification)[] = [
  'ply', 'gsm', 'stapleWidth', 'stapling', 'overlapWidth', 'printing', 'moisture', 'dimension', 'load', 'weightOfBox',
];

/** The specification fields a report tests: the fixed list, skipping ones the product leaves blank. */
export const testParameterKeys = (spec?: Partial<ProductSpecification> | null): string[] =>
  TEST_PARAMETERS.filter(k => String(spec?.[k] ?? '').trim() !== '');

const PARAMETER_LABELS: Record<string, string> = {
  ply: 'Ply', gsm: 'GSM', stapleWidth: 'Staple Width', overlapWidth: 'Overlaps Width', weightOfBox: 'Weight of Box',
};

/** Overall verdict: FAILED if any parameter failed; reports without marks count as passed. */
export const reportVerdict = (report: Pick<Report, 'testData'>): 'PASSED' | 'FAILED' =>
  Object.values(report.testData || {}).some((t: any) => t?.result === 'Low' || t?.result === 'High') ? 'FAILED' : 'PASSED';

export const reportKindLabel = (report: Pick<Report, 'kind'>): string =>
  report.kind === 'coc' ? 'Certificate of Conformance' : 'Quality Test Report';

/** "weightOfBox" -> "Weight Of Box". */
export const formatParameterLabel = (key: string): string =>
  PARAMETER_LABELS[key] ??
  key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
