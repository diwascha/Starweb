import { getFirebase } from '@/lib/firebase';
import { doc, writeBatch, deleteDoc, getDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { getTripsCollection } from './data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const addTrip = async (trip: any): Promise<string> => {
    const { db } = getFirebase();
    const id = doc(getTripsCollection()).id;
    const now = createTimestamp();
    const batch = writeBatch(db);
    
    const tripData = { ...trip, createdAt: now };
    batch.set(doc(getTripsCollection(), id), tripData);
    
    // Side effect: Sales Ledger
    const txnData = { type: 'Sales', tripId: id, amount: trip.transport, date: trip.date, createdAt: now };
    batch.set(doc(db, COLLECTIONS.TRANSACTIONS, `sales-${trip.tripNumber}`), txnData);
    
    batch.commit().catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'trips_batch',
            operation: 'write',
            requestResourceData: { trip: tripData, transaction: txnData }
        }));
    });
    
    return id;
};

export const deleteTrip = async (id: string) => {
    const { db } = getFirebase();
    const docRef = doc(getTripsCollection(), id);
    
    deleteDoc(docRef).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
};
