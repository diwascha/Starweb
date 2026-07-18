'use client';
/**
 * @fileOverview Employee service.
 * Refactored for non-blocking offline writes and enhanced noise filtering.
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    getDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    setDoc 
} from 'firebase/firestore';
import type { Employee } from '@/lib/types';
import { deleteFile } from './storage-service';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { logAudit } from './log-service';

const getEmployeesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.EMPLOYEES);
}

/**
 * Enhanced name validation to prevent "noise" rows.
 */
export const isValidEmployeeName = (name: string): boolean => {
    if (!name || typeof name !== 'string') return false;
    const n = name.trim();
    if (n.length < 2) return false;
    
    const lower = n.toLowerCase();
    const noisePatterns = [
        'trend:', 'absenteeism:', 'arrivals:', 'utilization:', 'absences (', 
        'shift-start', 'hotspots:', 'employee', 'total', 'behavioral patterns',
        'enhanced employee', 'pattern insights', 'day of week patterns', 'month-to-month'
    ];

    if (noisePatterns.some(pattern => lower.includes(pattern))) return false;
    if (/^\d+$/.test(n)) return false;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(n)) return false; 
    return true;
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Employee => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        status: data.status || 'Working',
        department: data.department,
        position: data.position,
        wageBasis: data.wageBasis,
        wageAmount: data.wageAmount || 0,
        allowance: data.allowance,
        address: data.address,
        gender: data.gender,
        mobileNumber: data.mobileNumber,
        dateOfBirth: data.dateOfBirth,
        joiningDate: data.joiningDate,
        identityType: data.identityType,
        documentNumber: data.documentNumber,
        referredBy: data.referredBy,
        photoURL: data.photoURL,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
        ownership: data.ownership || 'Shivam',
    };
}

export const getEmployees = async (): Promise<Employee[]> => {
    try {
        const snapshot = await getDocs(getEmployeesCollection());
        return snapshot.docs
            .map(fromFirestore)
            .filter(emp => isValidEmployeeName(emp.name));
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.EMPLOYEES,
            operation: 'list',
        }));
        throw error;
    }
};

export const getEmployee = async (id: string): Promise<Employee | null> => {
    if (!id || typeof id !== 'string') return null;
    const employeeDoc = doc(getEmployeesCollection(), id);
    try {
        const docSnap = await getDoc(employeeDoc);
        if (docSnap.exists()) {
            const employee = fromFirestore(docSnap);
            return isValidEmployeeName(employee.name) ? employee : null;
        }
        return null;
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: employeeDoc.path,
            operation: 'get',
        }));
        return null;
    }
};

export const addEmployee = async (employee: Omit<Employee, 'id'>): Promise<string> => {
    const docRef = doc(getEmployeesCollection());
    const id = docRef.id;
    const now = new Date().toISOString();
    
    const payload = {
        ...employee,
        createdAt: now,
    };

    setDoc(docRef, payload).then(() => {
        logAudit(`New Employee Onboarded: ${employee.name}`, 'HR', { id });
    }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: payload,
        }));
    });

    return id;
};

export const onEmployeesUpdate = (callback: (employees: Employee[]) => void): () => void => {
    return onSnapshot(getEmployeesCollection(), 
        (snapshot) => {
            const validEmployees = snapshot.docs
                .map(fromFirestore)
                .filter(emp => isValidEmployeeName(emp.name));
            callback(validEmployees);
        },
        async (error) => {
             errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.EMPLOYEES, operation: 'list' }));
        }
    );
};

export const updateEmployee = async (id: string, employee: Partial<Omit<Employee, 'id'>>): Promise<void> => {
    const employeeDoc = doc(getEmployeesCollection(), id);
    const payload = {
        ...employee,
        lastModifiedAt: new Date().toISOString(),
    };

    updateDoc(employeeDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: employeeDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};

export const deleteEmployee = async (id: string, photoURL?: string): Promise<void> => {
    const employeeDoc = doc(getEmployeesCollection(), id);

    if (photoURL) {
        try {
            await deleteFile(photoURL);
        } catch (error) {
            console.error("Failed to delete employee photo from storage:", error);
        }
    }

    deleteDoc(employeeDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: employeeDoc.path, operation: 'delete' }));
    });
};