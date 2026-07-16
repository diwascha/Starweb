import { getFirebase } from '@/lib/firebase';
import { doc, writeBatch, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';
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
    const txnData = { 
        type: 'Sales', 
        tripId: id, 
        amount: trip.transport, 
        date: trip.date, 
        createdAt: now,
        items: [{ particular: `Trip ${trip.tripNumber}`, quantity: 1, rate: trip.transport }],
        referenceType: 'Trip Sheet',
        referenceId: trip.tripNumber,
        billingType: 'Credit',
        invoiceType: 'Normal',
        createdBy: trip.createdBy
    };
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

export const updateTrip = async (id: string, updates: any): Promise<void> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    const batch = writeBatch(db);
    
    const tripRef = doc(getTripsCollection(), id);
    batch.update(tripRef, { ...updates, lastModifiedAt: now });
    
    // Sync with Ledger
    const txnRef = doc(db, COLLECTIONS.TRANSACTIONS, `sales-${updates.tripNumber}`);
    const txnUpdate = {
        amount: updates.transport,
        date: updates.date,
        lastModifiedAt: now,
        lastModifiedBy: updates.lastModifiedBy,
        items: [{ particular: `Trip ${updates.tripNumber}`, quantity: 1, rate: updates.transport }]
    };
    batch.set(txnRef, txnUpdate, { merge: true });

    batch.commit().catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'trips_update_batch',
            operation: 'write',
            requestResourceData: { updates }
        }));
    });
};

export const deleteTrip = async (id: string) => {
    const { db } = getFirebase();
    const docRef = doc(getTripsCollection(), id);
    
    const tripSnap = await getDoc(docRef);
    if (!tripSnap.exists()) return;
    
    const trip = tripSnap.data();
    const batch = writeBatch(db);
    
    batch.delete(docRef);
    batch.delete(doc(db, COLLECTIONS.TRANSACTIONS, `sales-${trip.tripNumber}`));
    
    batch.commit().catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'trips_delete_batch',
            operation: 'write'
        }));
    });
};