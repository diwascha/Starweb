'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Driver } from '@/lib/types';
import { deleteFile } from './storage-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getDriversCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'drivers');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Driver => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        nickname: data.nickname,
        licenseNumber: data.licenseNumber,
        contactNumber: data.contactNumber,
        dateOfBirth: data.dateOfBirth,
        photoURL: data.photoURL,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getDrivers = async (): Promise<Driver[]> => {
    try {
        const snapshot = await getDocs(getDriversCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'drivers',
            operation: 'list',
        }));
        throw error;
    }
};

export const addDriver = async (driver: Omit<Driver, 'id'>): Promise<string> => {
    const payload = {
        ...driver,
        createdAt: new Date().toISOString(),
    };
    const docRef = await addDoc(getDriversCollection(), payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'drivers',
            operation: 'create',
            requestResourceData: payload,
        }));
        throw err;
    });
    return docRef.id;
};

export const onDriversUpdate = (callback: (drivers: Driver[]) => void): () => void => {
    return onSnapshot(getDriversCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'drivers',
                operation: 'list',
            }));
        }
    );
};

export const updateDriver = async (id: string, driver: Partial<Omit<Driver, 'id'>>): Promise<void> => {
    const driverDoc = doc(getDriversCollection(), id);
    const payload = {
        ...driver,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(driverDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: driverDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};

export const deleteDriver = async (id: string, photoURL?: string): Promise<void> => {
    if (photoURL) {
        try {
            await deleteFile(photoURL);
        } catch (error) {
            console.error("Failed to delete driver photo from storage:", error);
        }
    }
    const driverDoc = doc(getDriversCollection(), id);
    deleteDoc(driverDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: driverDoc.path,
            operation: 'delete',
        }));
    });
};