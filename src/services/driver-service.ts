
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Driver } from '@/lib/types';

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
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const addDriver = async (driver: Omit<Driver, 'id'>): Promise<string> => {
    const docRef = await addDoc(driversCollection, driver);
    return docRef.id;
};

export const onDriversUpdate = (callback: (drivers: Driver[]) => void): () => void => {
    return onSnapshot(driversCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateDriver = async (id: string, driver: Partial<Omit<Driver, 'id'>>): Promise<void> => {
    const driverDoc = doc(db, 'drivers', id);
    await updateDoc(driverDoc, driver);
};

export const deleteDriver = async (id: string): Promise<void> => {
    const driverDoc = doc(db, 'drivers', id);
    await deleteDoc(driverDoc);
};
