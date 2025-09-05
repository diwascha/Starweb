
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs } from 'firebase/firestore';
import type { AttendanceRecord } from '@/lib/types';

const attendanceCollection = collection(db, 'attendance');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        bsDate: data.bsDate,
        employeeName: data.employeeName,
        onDuty: data.onDuty,
        offDuty: data.offDuty,
        clockIn: data.clockIn,
        clockOut: data.clockOut,
        status: data.status,
        importedBy: data.importedBy,
    };
};

export const addAttendanceRecords = async (records: Omit<AttendanceRecord, 'id'>[]): Promise<void> => {
    const batch = writeBatch(db);
    records.forEach(record => {
        const docId = `${record.date}-${record.employeeName}`;
        const docRef = doc(attendanceCollection, docId);
        batch.set(docRef, record);
    });
    await batch.commit();
};

export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    return onSnapshot(attendanceCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};
