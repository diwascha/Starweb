/**
 * @fileOverview Employee service.
 * Refactored for non-blocking offline writes.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDoc, setDoc } from 'firebase/firestore';
import type { Employee } from '@/lib/types';
import { deleteFile } from './storage-service';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getEmployeesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.EMPLOYEES);
}

/**
 * Enhanced name validation to prevent "noise" rows (analytics, trends, headers) 
 * from the Consolidated Ledger being incorrectly saved as employees.
 */
const isValidEmployeeName = (name: string): boolean => {
    if (!name || typeof name !== 'string') return false;
    const n = name.trim();
    if (n.length < 2) return false;
    
    const lower = n.toLowerCase();
    
    // Explicitly block analysis metrics and spreadsheet UI strings
    const noisePatterns = [
        'trend:', 
        'absenteeism:', 
        'arrivals:', 
        'utilization:', 
        'absences (', 
        'shift-start', 
        'hotspots:',
        'employee', 
        'total',
        'behavioral patterns',
        'enhanced employee',
        'pattern insights',
        'day of week patterns',
        'month-to-month'
    ];

    if (noisePatterns.some(pattern => lower.includes(pattern))) return false;

    // Block common date/time formats often found in error rows
    if (/^\d+$/.test(n)) return false;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(n)) return false; 
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(n)) return false; 
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(n)) return false; 
    if (lower.includes('gmt')) return false; 

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
        wageAmount: data.wageAmount,
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
    };
}

export const getEmployees = async (): Promise<Employee[]> => {
    const snapshot = await getDocs(getEmployeesCollection());
    return snapshot.docs.map(fromFirestore).filter(emp => isValidEmployeeName(emp.name));
};

export const getEmployee = async (id: string): Promise<Employee | null> => {
    if (!id || typeof id !== 'string') return null;
    const employeeDoc = doc(getEmployeesCollection(), id);
    const docSnap = await getDoc(employeeDoc);
    if (docSnap.exists()) {
        const employee = fromFirestore(docSnap);
        return isValidEmployeeName(employee.name) ? employee : null;
    }
    return null;
};

export const addEmployee = async (employee: Omit<Employee, 'id'>): Promise<string> => {
    const docRef = doc(getEmployeesCollection());
    const id = docRef.id;
    const now = new Date().toISOString();
    
    const payload = {
        ...employee,
        createdAt: now,
    };

    setDoc(docRef, payload).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: payload,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });

    return id;
};

export const onEmployeesUpdate = (callback: (employees: Employee[]) => void): () => void => {
    return onSnapshot(getEmployeesCollection(), 
        (snapshot) => {
            const validEmployees = snapshot.docs.map(fromFirestore).filter(emp => isValidEmployeeName(emp.name));
            callback(validEmployees);
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.EMPLOYEES, operation: 'list' }));
        }
    );
};

export const updateEmployee = async (id: string, employee: Partial<Omit<Employee, 'id'>>): Promise<void> => {
    const employeeDoc = doc(getEmployeesCollection(), id);
    updateDoc(employeeDoc, {
        ...employee,
        lastModifiedAt: new Date().toISOString(),
    }).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
            path: employeeDoc.path,
            operation: 'update',
            requestResourceData: employee,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
};

export const deleteEmployee = async (id: string, photoURL?: string): Promise<void> => {
    if (photoURL) {
        try {
            await deleteFile(photoURL);
        } catch (error) {
            console.error("Failed to delete employee photo from storage:", error);
        }
    }
    const employeeDoc = doc(getEmployeesCollection(), id);
    deleteDoc(employeeDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: employeeDoc.path, operation: 'delete' }));
    });
};

