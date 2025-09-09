

import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, updateDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import type { AttendanceRecord } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { format } from 'date-fns';


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
        sourceSheet: data.sourceSheet,
    };
};

export const getAttendance = async (): Promise<AttendanceRecord[]> => {
    const snapshot = await getDocs(attendanceCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addAttendanceRecords = async (records: Omit<AttendanceRecord, 'id'>[]): Promise<void> => {
    const batch = writeBatch(db);

    // Fetch existing records for the dates and employees being imported
    const dates = [...new Set(records.map(r => r.date))];
    const employeeNames = [...new Set(records.map(r => r.employeeName))];
    
    const existingRecordsQuery = query(
        attendanceCollection,
        where('date', 'in', dates),
        where('employeeName', 'in', employeeNames)
    );
    const snapshot = await getDocs(existingRecordsQuery);
    const existingRecordsMap = new Map<string, { id: string, data: AttendanceRecord }>();
    snapshot.docs.forEach(doc => {
        const data = fromFirestore(doc);
        const key = `${data.employeeName}-${data.date}`;
        existingRecordsMap.set(key, { id: doc.id, data });
    });


    records.forEach(record => {
        const key = `${record.employeeName}-${record.date}`;
        const existing = existingRecordsMap.get(key);

        if (existing) {
            // Update existing record
            batch.update(doc(attendanceCollection, existing.id), record);
        } else {
            // Add new record
            const docRef = doc(attendanceCollection); // Creates a new doc with a unique random ID
            batch.set(docRef, record);
        }
    });
    await batch.commit();
};

export const updateAttendanceRecord = async (id: string, record: Partial<AttendanceRecord>): Promise<void> => {
    const recordDoc = doc(db, 'attendance', id);
    await updateDoc(recordDoc, record);
};

export const batchUpdateAttendance = async (updates: { id: string; updates: Partial<AttendanceRecord> }[]): Promise<void> => {
    const batch = writeBatch(db);
    updates.forEach(({ id, updates }) => {
        const docRef = doc(db, 'attendance', id);
        batch.update(docRef, updates);
    });
    await batch.commit();
};


export const deleteAttendanceRecord = async (id: string): Promise<void> => {
    const recordDoc = doc(db, 'attendance', id);
    await deleteDoc(recordDoc);
};

export const deleteAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const snapshot = await getDocs(attendanceCollection);
    const recordsToDelete = snapshot.docs.filter(doc => {
        const data = doc.data();
        if (data.date && !isNaN(new Date(data.date).getTime())) {
            const nepaliDate = new NepaliDate(new Date(data.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        }
        return false;
    });

    if (recordsToDelete.length === 0) {
        console.log("No records to delete for the specified month.");
        return;
    }

    const batch = writeBatch(db);
    recordsToDelete.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Deleted ${recordsToDelete.length} records for ${bsYear}-${bsMonth + 1}.`);
};



export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    return onSnapshot(attendanceCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

    

    