
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import type { AttendanceRecord } from '@/lib/types';

const attendanceCollection = collection(db, 'attendance');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        bsDate: data.bsDate,
        employeeName: data.employeeName,
        onDuty: data.onDuty || null,
        offDuty: data.offDuty || null,
        clockIn: data.clockIn || null,
        clockOut: data.clockOut || null,
        status: data.status,
        grossHours: data.grossHours || 0,
        overtimeHours: data.overtimeHours || 0,
        regularHours: data.regularHours || 0,
        remarks: data.remarks || null,
        importedBy: data.importedBy,
    };
};

export const getAttendance = async (): Promise<AttendanceRecord[]> => {
    const snapshot = await getDocs(attendanceCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addAttendanceRecords = async (records: Omit<AttendanceRecord, 'id'>[]): Promise<void> => {
    const batch = writeBatch(db);
    records.forEach(record => {
        // Ensure date is a string and valid before creating docId
        const recordDate = new Date(record.date);
        if (record.date && !isNaN(recordDate.getTime())) {
            const dateString = recordDate.toISOString().substring(0, 10);
            const docId = `${dateString}_${record.employeeName.replace(/\s+/g, '-')}`;
            const docRef = doc(attendanceCollection, docId);
            batch.set(docRef, record, { merge: true });
        }
    });
    await batch.commit();
};

export const updateAttendanceRecord = async (id: string, record: Partial<AttendanceRecord>): Promise<void> => {
    const recordDoc = doc(db, 'attendance', id);
    await updateDoc(recordDoc, record);
};

export const deleteAttendanceRecord = async (id: string): Promise<void> => {
    const recordDoc = doc(db, 'attendance', id);
    await deleteDoc(recordDoc);
};


export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    return onSnapshot(attendanceCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};
