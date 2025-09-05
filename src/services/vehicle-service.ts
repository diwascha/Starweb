
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Vehicle } from '@/lib/types';

const vehiclesCollection = collection(db, 'vehicles');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Vehicle => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        make: data.make,
        model: data.model,
        year: data.year,
        vin: data.vin,
        status: data.status,
        driverId: data.driverId,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const addVehicle = async (vehicle: Omit<Vehicle, 'id'>): Promise<string> => {
    const docRef = await addDoc(vehiclesCollection, vehicle);
    return docRef.id;
};

export const onVehiclesUpdate = (callback: (vehicles: Vehicle[]) => void): () => void => {
    return onSnapshot(vehiclesCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateVehicle = async (id: string, vehicle: Partial<Omit<Vehicle, 'id'>>): Promise<void> => {
    const vehicleDoc = doc(db, 'vehicles', id);
    await updateDoc(vehicleDoc, vehicle);
};

export const deleteVehicle = async (id: string): Promise<void> => {
    const vehicleDoc = doc(db, 'vehicles', id);
    await deleteDoc(vehicleDoc);
};
