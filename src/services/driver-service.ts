
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Driver } from '@/lib/types';
import { deleteFile } from './storage-service';


const driversCollection = collection(db, 'drivers');

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
    const snapshot = await getDocs(driversCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addDriver = async (driver: Omit<Driver, 'id'>): Promise<string> => {
    const docRef = await addDoc(driversCollection, {
        ...driver,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onDriversUpdate = (callback: (drivers: Driver[]) => void): () => void => {
    return onSnapshot(driversCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateDriver = async (id: string, driver: Partial<Omit<Driver, 'id'>>): Promise<void> => {
    const driverDoc = doc(db, 'drivers', id);
    await updateDoc(driverDoc, {
        ...driver,
        lastModifiedAt: new Date().toISOString(),
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
    const driverDoc = doc(db, 'drivers', id);
    await deleteDoc(driverDoc);
};
