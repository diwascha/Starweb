
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Vehicle } from '@/lib/types';

const getVehiclesCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'vehicles');
};

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
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

// Memory cache to avoid repeated JSON parsing from sessionStorage
const vehicleCache = new Map<string, { data: Vehicle[]; timestamp: number }>();

export const getVehicles = async (useCache = false): Promise<Vehicle[]> => {
    if (useCache) {
        const cached = vehicleCache.get('vehicles');
        // Cache valid for 60 seconds
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached.data;
        }
    }
    
    const snapshot = await getDocs(getVehiclesCollection());
    const vehicles = snapshot.docs.map(fromFirestore);
    
    vehicleCache.set('vehicles', { data: vehicles, timestamp: Date.now() });
    
    return vehicles;
};

export const addVehicle = async (vehicle: Omit<Vehicle, 'id'>): Promise<string> => {
    const docRef = await addDoc(getVehiclesCollection(), {
        ...vehicle,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onVehiclesUpdate = (callback: (vehicles: Vehicle[]) => void): () => void => {
    return onSnapshot(getVehiclesCollection(), 
        (snapshot) => {
            const vehicles = snapshot.docs.map(fromFirestore);
            vehicleCache.set('vehicles', { data: vehicles, timestamp: Date.now() });
            callback(vehicles);
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Vehicles):", error.message, error);
        }
    );
};

export const updateVehicle = async (id: string, vehicle: Partial<Omit<Vehicle, 'id'>>): Promise<void> => {
    if (!id) return;
    const vehicleDoc = doc(getVehiclesCollection(), id);
    await updateDoc(vehicleDoc, {
        ...vehicle,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteVehicle = async (id: string): Promise<void> => {
    if (!id) return;
    const vehicleDoc = doc(getVehiclesCollection(), id);
    await deleteDoc(vehicleDoc);
};
