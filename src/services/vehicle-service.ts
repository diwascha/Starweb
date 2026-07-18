'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, setDoc } from 'firebase/firestore';
import type { Vehicle, VehicleStatus } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
        ownership: data.ownership || 'Sijan',
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
    
    try {
        const snapshot = await getDocs(getVehiclesCollection());
        const vehicles = snapshot.docs.map(fromFirestore);
        vehicleCache.set('vehicles', { data: vehicles, timestamp: Date.now() });
        return vehicles;
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'vehicles',
            operation: 'list',
        }));
        throw error;
    }
};

export const addVehicle = async (vehicle: Omit<Vehicle, 'id'>): Promise<string> => {
    const payload = {
        ...vehicle,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getVehiclesCollection());
    setDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'vehicles',
            operation: 'create',
            requestResourceData: payload,
        }));
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
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'vehicles',
                operation: 'list',
            }));
        }
    );
};

export const updateVehicle = async (id: string, vehicle: Partial<Omit<Vehicle, 'id'>>): Promise<void> => {
    if (!id) return;
    const vehicleDoc = doc(getVehiclesCollection(), id);
    const payload = {
        ...vehicle,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(vehicleDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: vehicleDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};

export const deleteVehicle = async (id: string): Promise<void> => {
    if (!id) return;
    const vehicleDoc = doc(getVehiclesCollection(), id);
    deleteDoc(vehicleDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: vehicleDoc.path,
            operation: 'delete',
        }));
    });
};