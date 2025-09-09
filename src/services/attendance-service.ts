
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

export const addAttendanceRecords = async (records: Omit<AttendanceRecord, 'id'>[], onProgress: (progress: number) => void): Promise<void> => {
    const CHUNK_SIZE = 200; // Process records in chunks
    let progressCount = 0;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        
        const dates = [...new Set(chunk.map(r => r.date))];
        const employeeNames = [...new Set(chunk.map(r => r.employeeName))];
        
        if (dates.length === 0 || employeeNames.length === 0) continue;

        const existingRecordsMap = new Map<string, { id: string, data: AttendanceRecord }>();

        // Query for existing records in smaller, manageable chunks to avoid Firestore limits
        const DATE_CHUNK_SIZE = 10;
        const NAME_CHUNK_SIZE = 10;
        
        for (let j = 0; j < dates.length; j += DATE_CHUNK_SIZE) {
            const dateChunk = dates.slice(j, j + DATE_CHUNK_SIZE);
            for (let k = 0; k < employeeNames.length; k += NAME_CHUNK_SIZE) {
                const nameChunk = employeeNames.slice(k, k + NAME_CHUNK_SIZE);
                
                const existingRecordsQuery = query(
                    attendanceCollection,
                    where('date', 'in', dateChunk),
                    where('employeeName', 'in', nameChunk)
                );
                const snapshot = await getDocs(existingRecordsQuery);
                 snapshot.docs.forEach(doc => {
                    const data = fromFirestore(doc);
                    const key = `${data.employeeName}-${data.date}`;
                    existingRecordsMap.set(key, { id: doc.id, data });
                });
            }
        }
        
        let batch = writeBatch(db);
        let operationCount = 0;

        for (const record of chunk) {
            const key = `${record.employeeName}-${record.date}`;
            const existing = existingRecordsMap.get(key);

            if (existing) {
                batch.update(doc(attendanceCollection, existing.id), record);
            } else {
                const docRef = doc(attendanceCollection);
                batch.set(docRef, record);
            }

            operationCount++;

            if (operationCount >= 499) { // Firestore batch write limit
                await batch.commit();
                batch = writeBatch(db);
                operationCount = 0;
            }
        }
        
        if (operationCount > 0) {
            await batch.commit();
        }
        
        progressCount += chunk.length;
        onProgress(progressCount);
    }
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
