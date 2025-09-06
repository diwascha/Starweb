
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Trip } from '@/lib/types';

const tripsCollection = collection(db, 'trips');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Trip => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        vehicleId: data.vehicleId,
        primaryDestination: data.primaryDestination,
        locationType: data.locationType,
        destinations: data.destinations,
        truckAdvance: data.truckAdvance,
        transport: data.transport,
        fuelEntries: data.fuelEntries,
        extraExpenses: data.extraExpenses,
        returnLoadIncome: data.returnLoadIncome,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const addTrip = async (trip: Omit<Trip, 'id'>): Promise<string> => {
    const docRef = await addDoc(tripsCollection, {
        ...trip,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onTripsUpdate = (callback: (trips: Trip[]) => void): () => void => {
    return onSnapshot(tripsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateTrip = async (id: string, trip: Partial<Omit<Trip, 'id'>>): Promise<void> => {
    const tripDoc = doc(db, 'trips', id);
    await updateDoc(tripDoc, {
        ...trip,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteTrip = async (id: string): Promise<void> => {
    const tripDoc = doc(db, 'trips', id);
    await deleteDoc(tripDoc);
};
