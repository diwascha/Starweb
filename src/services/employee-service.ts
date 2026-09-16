'use client';
/**
 * @fileOverview Employee service.
 * Refactored for non-blocking offline writes and enhanced noise filtering.
 */

import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
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
import type { Employee, WageRevision } from '@/lib/types';
import { deleteFile } from './storage-service';
import { COLLECTIONS } from '@/lib/constants';
import { stripUndefined } from '@/lib/service-utils';
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

    // Section labels from the monthly sheets that sit in the same column as
    // employee names (a TRUCK/Drivers block, a sub-header). Matched whole so
    // a real name that merely contains one of these words is unaffected.
    const sectionLabels = ['name', 'truck', 'trucks', 'driver', 'drivers', 'staff', 'total', 's.n.', 'sn'];
    if (sectionLabels.includes(lower)) return false;

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
        wageHistory: Array.isArray(data.wageHistory) ? data.wageHistory : undefined,
        address: data.address,
        gender: data.gender,
        mobileNumber: data.mobileNumber,
        email: data.email,
        dateOfBirth: data.dateOfBirth,
        joiningDate: data.joiningDate,
        identityType: data.identityType,
        documentNumber: data.documentNumber,
        referredBy: data.referredBy,
        photoURL: data.photoURL,
        shiftId: data.shiftId,
        bloodGroup: data.bloodGroup,
        emergencyContactName: data.emergencyContactName,
        emergencyContactNumber: data.emergencyContactNumber,
        qualification: data.qualification,
        documents: Array.isArray(data.documents) ? data.documents : undefined,
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
    if (!id || typeof id !== 'string' || id.includes('/')) return null;
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

    // Seed the wage history with the opening rate, dated from the joining
    // date when there is one, so the very first rate is part of the record
    // rather than only appearing once someone later edits it.
    const openingRevision: WageRevision = {
        effectiveFrom: employee.joiningDate || now,
        wageBasis: employee.wageBasis,
        wageAmount: employee.wageAmount || 0,
        allowance: employee.allowance,
        note: 'Opening rate',
        recordedBy: employee.createdBy,
        recordedAt: now,
    };

    const payload = stripUndefined({
        ...employee,
        wageHistory: [stripUndefined(openingRevision)],
        createdAt: now,
    });

    reportWriteFailure(
        setDoc(docRef, payload).then(() => {
        logAudit(`New Employee Onboarded: ${employee.name}`, 'HR', { id });
    }),
        { path: docRef.path, operation: 'create', requestResourceData: payload }
    );

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

/**
 * Appends a wage revision whenever an update actually changes the wage
 * basis, amount or allowance. Reads the current record first (only when the
 * update touches wage fields at all) so an unchanged re-save doesn't
 * manufacture a revision, and so the history survives callers that know
 * nothing about it - the Reschedule dialog, the status dropdown, etc.
 */
const buildWageHistory = async (
    employeeDoc: ReturnType<typeof doc>,
    update: Partial<Omit<Employee, 'id'>>,
): Promise<WageRevision[] | undefined> => {
    const touchesWage = update.wageAmount !== undefined
        || update.wageBasis !== undefined
        || update.allowance !== undefined;
    if (!touchesWage) return undefined;

    // Best-effort: this service is built for non-blocking offline writes, so
    // a read that can't be served (offline with nothing cached) must not take
    // the wage change down with it. Worst case the change applies without a
    // history entry.
    let current: DocumentData | undefined;
    try {
        const snap = await getDoc(employeeDoc);
        if (!snap.exists()) return undefined;
        current = snap.data();
    } catch {
        return undefined;
    }

    const nextBasis = update.wageBasis ?? current.wageBasis;
    const nextAmount = update.wageAmount ?? current.wageAmount ?? 0;
    const nextAllowance = update.allowance ?? current.allowance;

    const unchanged = nextBasis === current.wageBasis
        && Number(nextAmount) === Number(current.wageAmount ?? 0)
        && Number(nextAllowance ?? 0) === Number(current.allowance ?? 0);
    if (unchanged) return undefined;

    const now = new Date().toISOString();
    const history: WageRevision[] = Array.isArray(current.wageHistory) ? [...current.wageHistory] : [];
    history.push(stripUndefined({
        effectiveFrom: now,
        wageBasis: nextBasis,
        wageAmount: Number(nextAmount) || 0,
        allowance: nextAllowance,
        recordedBy: update.lastModifiedBy || 'System',
        recordedAt: now,
    }) as WageRevision);
    return history;
};

export const updateEmployee = async (id: string, employee: Partial<Omit<Employee, 'id'>>): Promise<void> => {
    const employeeDoc = doc(getEmployeesCollection(), id);
    const wageHistory = await buildWageHistory(employeeDoc, employee);
    const payload = stripUndefined({
        ...employee,
        ...(wageHistory ? { wageHistory } : {}),
        lastModifiedAt: new Date().toISOString(),
    });

    reportWriteFailure(
        updateDoc(employeeDoc, payload),
        { path: employeeDoc.path, operation: 'update', requestResourceData: payload }
    );
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

    reportWriteFailure(
        deleteDoc(employeeDoc),
        { path: employeeDoc.path, operation: 'delete' }
    );
};