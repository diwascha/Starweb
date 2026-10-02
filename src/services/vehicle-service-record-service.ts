'use client';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, setDoc } from 'firebase/firestore';
import type { VehicleService } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { COLLECTIONS } from '@/lib/constants';

const getServicesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.VEHICLE_SERVICES);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): VehicleService => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        vehicleId: data.vehicleId || '',
        serviceDate: data.serviceDate || new Date().toISOString(),
        serviceKm: Number(data.serviceKm) || 0,
        nextServiceKm: Number(data.nextServiceKm) || 0,
        nextServiceDate: data.nextServiceDate || new Date().toISOString(),
        remarks: data.remarks || '',
        ownership: data.ownership || 'Both',
        createdBy: data.createdBy || 'System',
        createdAt: data.createdAt || new Date().toISOString(),
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

export const addVehicleService = async (record: Omit<VehicleService, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = doc(getServicesCollection());
    const payload = { ...record, createdAt: new Date().toISOString() };
    reportWriteFailure(
        setDoc(docRef, payload),
        { path: COLLECTIONS.VEHICLE_SERVICES, operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const onVehicleServicesUpdate = (callback: (records: VehicleService[]) => void): () => void => {
    return onSnapshot(getServicesCollection(),
        (snapshot) => callback(snapshot.docs.map(fromFirestore)),
        (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.VEHICLE_SERVICES, operation: 'list' }));
            }
        }
    );
};

export const updateVehicleService = async (id: string, record: Partial<Omit<VehicleService, 'id'>>): Promise<void> => {
    const payload = { ...record, lastModifiedAt: new Date().toISOString() };
    reportWriteFailure(
        updateDoc(doc(getServicesCollection(), id), payload),
        { path: COLLECTIONS.VEHICLE_SERVICES, operation: 'update', requestResourceData: payload }
    );
};

export const deleteVehicleService = async (id: string): Promise<void> => {
    reportWriteFailure(
        deleteDoc(doc(getServicesCollection(), id)),
        { path: COLLECTIONS.VEHICLE_SERVICES, operation: 'delete' }
    );
};
