/**
 * @fileOverview HR Administration service for shifts and holidays.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { HrShift, PublicHoliday, LeaveRequest } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getShiftsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'hr_shifts');
};

const getHolidaysCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'public_holidays');
};

const getLeaveRequestsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'leave_requests');
};

// --- Shift Management ---

export const onShiftsUpdate = (callback: (shifts: HrShift[]) => void) => {
    const q = query(getShiftsCollection(), orderBy('name'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as HrShift)));
    }, (error) => {
        logServiceError('onShiftsUpdate', error);
    });
};

export const saveShift = async (shift: Omit<HrShift, 'id'>, id?: string) => {
    const docRef = id ? doc(getShiftsCollection(), id) : doc(getShiftsCollection());
    const finalId = id || docRef.id;
    
    setDoc(docRef, { ...shift, createdAt: createTimestamp() }, { merge: true }).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write' }));
    });
    return finalId;
};

export const deleteShift = async (id: string) => {
    const docRef = doc(getShiftsCollection(), id);
    deleteDoc(docRef).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
    });
};

// --- Holiday Management ---

export const onHolidaysUpdate = (callback: (holidays: PublicHoliday[]) => void) => {
    const q = query(getHolidaysCollection(), orderBy('date'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PublicHoliday)));
    }, (error) => {
        logServiceError('onHolidaysUpdate', error);
    });
};

export const getHolidays = async (): Promise<PublicHoliday[]> => {
    const snap = await getDocs(getHolidaysCollection());
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PublicHoliday));
};

export const saveHoliday = async (holiday: Omit<PublicHoliday, 'id'>, id?: string) => {
    const docRef = id ? doc(getHolidaysCollection(), id) : doc(getHolidaysCollection());
    const finalId = id || docRef.id;
    
    setDoc(docRef, holiday, { merge: true }).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write' }));
    });
    return finalId;
};

export const deleteHoliday = async (id: string) => {
    const docRef = doc(getHolidaysCollection(), id);
    deleteDoc(docRef).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
    });
};

// --- Leave Management ---

export const onLeaveRequestsUpdate = (callback: (requests: LeaveRequest[]) => void) => {
    const q = query(getLeaveRequestsCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    }, (error) => {
        logServiceError('onLeaveRequestsUpdate', error);
    });
};

export const getLeaveRequests = async (): Promise<LeaveRequest[]> => {
    const snap = await getDocs(getLeaveRequestsCollection());
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
};

export const saveLeaveRequest = async (request: Omit<LeaveRequest, 'id'>, id?: string) => {
    const docRef = id ? doc(getLeaveRequestsCollection(), id) : doc(getLeaveRequestsCollection());
    const finalId = id || docRef.id;
    
    setDoc(docRef, { ...request, createdAt: createTimestamp() }, { merge: true }).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write' }));
    });
    return finalId;
};

export const deleteLeaveRequest = async (id: string) => {
    const docRef = doc(getLeaveRequestsCollection(), id);
    deleteDoc(docRef).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
    });
};
