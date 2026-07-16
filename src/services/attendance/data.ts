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
        date: String(data.date || ''),
        dateBS: String(data.dateBS || ''),
        bsYear: Number(data.bsYear) || 0,
        bsMonth: Number(data.bsMonth) || 0,
        employeeName: String(data.employeeName || ''),
        onDuty: data.onDuty ? String(data.onDuty) : null,
        offDuty: data.offDuty ? String(data.offDuty) : null,
        clockIn: data.clockIn ? String(data.clockIn) : null,
        clockOut: data.clockOut ? String(data.clockOut) : null,
        statusFromMachine: String(data.statusFromMachine || ''),
        regularHoursFromMachine: Number(data.regularHoursFromMachine) || 0,
        overtimeHoursFromMachine: Number(data.overtimeHoursFromMachine) || 0,
        remarks: data.remarks ? String(data.remarks) : null,
        importId: String(data.importId || ''),
        importedAt: String(data.importedAt || ''),
        importedBy: String(data.importedBy || ''),
        sourceSheet: String(data.sourceSheet || ''),
        rawPayload: (data.rawPayload || {}) as Record<string, any>,
        rowIndex: data.rowIndex !== undefined ? Number(data.rowIndex) : undefined,
        isManual: !!data.isManual,
    };
};

export const fromFirestoreRecord = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: String(data.date || ''),
        dateBS: String(data.dateBS || data.bsDate || ''),
        bsYear: Number(data.bsYear) || 0,
        bsMonth: Number(data.bsMonth) || 0,
        employeeName: String(data.employeeName || ''),
        employeeId: String(data.employeeId || ''),
        onDuty: data.onDuty ? String(data.onDuty) : null,
        offDuty: data.offDuty ? String(data.offDuty) : null,
        clockIn: data.clockIn ? String(data.clockIn) : null,
        clockOut: data.clockOut ? String(data.clockOut) : null,
        status: String(data.status || ''),
        grossHours: Number(data.grossHours) || 0,
        overtimeHours: Number(data.overtimeHours) || 0,
        regularHours: Number(data.regularHours) || 0,
        remarks: data.remarks ? String(data.remarks) : null,
        calculatedAt: String(data.calculatedAt || ''),
        calculatedBy: String(data.calculatedBy || ''),
        sourceLogId: data.sourceLogId ? String(data.sourceLogId) : undefined,
        rowIndex: data.rowIndex !== undefined ? Number(data.rowIndex) : undefined,
    };
};

export const onRawLogsUpdate = (callback: (logs: RawMachineLog[]) => void): () => void => {
    const collectionRef = getRawLogsCollection();
    const q = query(collectionRef, orderBy('importedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreLog));
    }, async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: collectionRef.path,
            operation: 'list'
        }));
    });
};

export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    const collectionRef = getAttendanceCollection();
    return onSnapshot(collectionRef, (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreRecord));
    }, async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: collectionRef.path,
            operation: 'list'
        }));
    });
};

export const getAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<AttendanceRecord[]> => {
    const q = query(getAttendanceCollection(), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestoreRecord);
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.ATTENDANCE,
            operation: 'list'
        }));
        throw err;
    }
};

export const deleteRawLog = async (id: string) => {
    const docRef = doc(getRawLogsCollection(), id);
    deleteDoc(docRef).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete'
        }));
    });
};

export const deleteRawLogsForMonth = async (year: number, month: number) => {
    const { db } = getFirebase();
    const q = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'raw_machine_logs_batch_delete',
            operation: 'write'
        }));
    });
};

export const deleteAttendanceRecord = async (id: string) => {
    const docRef = doc(getAttendanceCollection(), id);
    deleteDoc(docRef).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete'
        }));
    });
};

export const deleteAttendanceForMonth = async (year: number, month: number) => {
    const { db } = getFirebase();
    const q = query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'attendance_batch_delete',
            operation: 'write'
        }));
    });
};

export const deleteAllRawLogs = async (): Promise<void> => {
    const { db } = getFirebase();
    const snap = await getDocs(getRawLogsCollection());
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'raw_machine_logs_purge',
            operation: 'write'
        }));
    });
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
    await batch.commit().catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'attendance_system_purge',
            operation: 'write'
        }));
    });
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
    } catch (e) {}
    return Array.from(years).sort((a, b) => b - a);
};

export const updateRawLog = async (id: string, updates: Partial<RawMachineLog>) => {
    const docRef = doc(getRawLogsCollection(), id);
    updateDoc(docRef, updates).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: updates
        }));
    });
};

export const updateAttendanceRecord = async (id: string, updates: Partial<AttendanceRecord>) => {
    const docRef = doc(getAttendanceCollection(), id);
    updateDoc(docRef, updates).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: updates
        }));
    });
};