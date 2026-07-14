import { getFirebase } from '@/lib/firebase';
import { doc, writeBatch, deleteDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { getTripsCollection } from './data';

export const addTrip = async (trip: any): Promise<string> => {
    const { db } = getFirebase();
    const id = doc(getTripsCollection()).id;
    const now = createTimestamp();
    const batch = writeBatch(db);
    batch.set(doc(getTripsCollection(), id), { ...trip, createdAt: now });
    // Side effect: Sales Ledger
    batch.set(doc(db, COLLECTIONS.TRANSACTIONS, `sales-${trip.tripNumber}`), { type: 'Sales', tripId: id, amount: trip.transport, date: trip.date, createdAt: now });
    await batch.commit();
    return id;
};

export const deleteTrip = async (id: string) => {
    const { db } = getFirebase();
    await deleteDoc(doc(getTripsCollection(), id));
};
