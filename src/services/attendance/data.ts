import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    getDocs, 
    query, 
    where, 
    updateDoc, 
    deleteDoc, 
    orderBy,
    writeBatch
} from 'firebase/firestore';
import type { AttendanceRecord, RawMachineLog } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { logServiceError } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const getAttendanceCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.ATTENDANCE);
};

export const getRawLogsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'raw_machine_logs');
};

export const fromFirestoreLog = (snapshot: QueryDocumentSnapshot<DocumentData>): RawMachineLog => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        dateBS: data.dateBS || '',
        bsYear: data.bsYear,
        bsMonth: data.bsMonth,
        employeeName: data.employeeName,
        onDuty: data.onDuty,
        offDuty: data.offDuty,
        clockIn: data.clockIn,
        clockOut: data.clockOut,
        statusFromMachine: data.statusFromMachine,
        regularHoursFromMachine: data.regularHoursFromMachine,
        overtimeHoursFromMachine: data.overtimeHoursFromMachine,
        remarks: data.remarks,
        importId: data.importId,
        importedAt: data.importedAt,
        importedBy: data.importedBy,
        sourceSheet: data.sourceSheet,
        rawPayload: data.rawPayload,
        rowIndex: data.rowIndex,
        isManual: !!data.isManual,
    };
};

export const fromFirestoreRecord = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        bsDate: data.bsDate,
        bsYear: data.bsYear,
        bsMonth: data.bsMonth,
        employeeName: String(data.employeeName || ''),
        employeeId: data.employeeId,
        onDuty: data.onDuty || null,
        offDuty: data.offDuty || null,
        clockIn: data.clockIn || null,
        clockOut: data.clockOut || null,
        status: String(data.status || ''),
        grossHours: Number(data.grossHours) || 0,
        overtimeHours: Number(data.overtimeHours) || 0,
        regularHours: Number(data.regularHours) || 0,
        remarks: data.remarks || null,
        calculatedAt: data.calculatedAt,
        calculatedBy: data.calculatedBy,
        sourceLogId: data.sourceLogId,
        rowIndex: data.rowIndex,
    };
};

export const onRawLogsUpdate = (callback: (logs: RawMachineLog[]) => void): () => void => {
    const q = query(getRawLogsCollection(), orderBy('importedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreLog));
    }, (error) => {
        logServiceError('onRawLogsUpdate', error);
    });
};

export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    return onSnapshot(getAttendanceCollection(), (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreRecord));
    }, (error) => {
        logServiceError('onAttendanceUpdate', error);
    });
};

export const getAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<AttendanceRecord[]> => {
    const q = query(getAttendanceCollection(), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestoreRecord);
};

export const deleteRawLog = async (id: string) => {
    await deleteDoc(doc(getRawLogsCollection(), id));
};

export const deleteRawLogsForMonth = async (year: number, month: number) => {
    const { db } = getFirebase();
    const q = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
};

export const deleteAttendanceRecord = async (id: string) => {
    await deleteDoc(doc(getAttendanceCollection(), id));
};

export const deleteAttendanceForMonth = async (year: number, month: number) => {
    const { db } = getFirebase();
    const q = query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
};

export const deleteAllRawLogs = async (): Promise<void> => {
    const { db } = getFirebase();
    const snap = await getDocs(getRawLogsCollection());
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
};

export const deleteAllAttendance = async (): Promise<void> => {
    const { db } = getFirebase();
    const snaps = await Promise.all([
        getDocs(getAttendanceCollection()),
        getDocs(getRawLogsCollection()),
        getDocs(collection(db, COLLECTIONS.PAYROLL)),
        getDocs(collection(db, 'analytics_reports'))
    ]);
    const batch = writeBatch(db);
    snaps.forEach(snap => snap.forEach(d => batch.delete(d.ref)));
    await batch.commit();
};

export const getAttendanceYears = async (): Promise<number[]> => {
    const { db } = getFirebase();
    const years = new Set<number>();
    try {
        const [attSnap, blSnap, paySnap] = await Promise.all([
            getDocs(getAttendanceCollection()),
            getDocs(collection(db, 'behavior_ledger')),
            getDocs(collection(db, COLLECTIONS.PAYROLL))
        ]);
        attSnap.docs.forEach(d => years.add(d.data().bsYear as number));
        blSnap.docs.forEach(d => years.add(d.data().bsYear as number));
        paySnap.docs.forEach(d => years.add(d.data().bsYear as number));
    } catch (e) {
        console.error("Failed to discover years", e);
    }
    return Array.from(years).sort((a, b) => b - a);
};

export const updateRawLog = async (id: string, updates: Partial<RawMachineLog>) => {
    const docRef = doc(getRawLogsCollection(), id);
    await updateDoc(docRef, updates);
};

export const updateAttendanceRecord = async (id: string, updates: Partial<AttendanceRecord>) => {
    await updateDoc(doc(getAttendanceCollection(), id), updates);
};
