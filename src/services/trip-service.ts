
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, doc, updateDoc, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import type { Trip, Transaction } from '@/lib/types';
import { differenceInDays } from 'date-fns';

const tripsCollection = collection(db, 'trips');
const transactionsCollection = collection(db, 'transactions');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Trip => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        vehicleId: data.vehicleId,
        partyId: data.partyId,
        odometerStart: data.odometerStart,
        odometerEnd: data.odometerEnd,
        destinations: data.destinations,
        truckAdvance: data.truckAdvance,
        transport: data.transport,
        fuelEntries: data.fuelEntries,
        extraExpenses: data.extraExpenses,
        returnTrips: data.returnTrips,
        detentionStartDate: data.detentionStartDate,
        detentionEndDate: data.detentionEndDate,
        numberOfParties: data.numberOfParties,
        dropOffChargeRate: data.dropOffChargeRate,
        detentionChargeRate: data.detentionChargeRate,
        salesTransactionId: data.salesTransactionId,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

const calculateNetPay = (trip: Omit<Trip, 'id'>): number => {
    const days = trip.detentionStartDate && trip.detentionEndDate ? differenceInDays(new Date(trip.detentionEndDate), new Date(trip.detentionStartDate)) + 1 : 0;
    
    const totalFreight = (trip.destinations || []).reduce((sum, dest) => sum + (Number(dest.freight) || 0), 0);
    const numberOfParties = Number(trip.numberOfParties) || 0;
    const dropOffChargeRate = Number(trip.dropOffChargeRate) || 800;
    const dropOffCharge = numberOfParties > 3 ? (numberOfParties - 3) * dropOffChargeRate : 0;
    
    const detentionChargeRate = Number(trip.detentionChargeRate) || 3000;
    const detentionCharge = days * detentionChargeRate;

    const totalTaxable = totalFreight + dropOffCharge + detentionCharge;
    const vatAmount = totalTaxable * 0.13;
    const grossAmount = totalTaxable + vatAmount;
    const tdsAmount = grossAmount * 0.015;
    return grossAmount - tdsAmount;
};


export const addTrip = async (trip: Omit<Trip, 'id'>): Promise<string> => {
    const batch = writeBatch(db);
    
    const tripRef = doc(collection(db, 'trips'));

    const netPay = calculateNetPay(trip);
    const salesTransactionRef = doc(collection(db, 'transactions'));
    
    const salesTransaction: Omit<Transaction, 'id'> = {
        vehicleId: trip.vehicleId,
        date: trip.date,
        type: 'Sales',
        amount: netPay,
        description: `Sales from trip to ${trip.destinations[0]?.name || 'destination'}`,
        partyId: trip.partyId,
        tripId: tripRef.id,
        createdBy: trip.createdBy,
        createdAt: new Date().toISOString(),
    };
    batch.set(salesTransactionRef, salesTransaction);

    const newTripData = {
      ...trip,
      createdAt: new Date().toISOString(),
      salesTransactionId: salesTransactionRef.id,
    };
    batch.set(tripRef, newTripData);

    await batch.commit();
    return tripRef.id;
};

export const onTripsUpdate = (callback: (trips: Trip[]) => void): () => void => {
    return onSnapshot(tripsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getTrip = async (id: string): Promise<Trip | null> => {
    const tripDoc = doc(db, 'trips', id);
    const docSnap = await getDoc(tripDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};

export const updateTrip = async (id: string, trip: Partial<Omit<Trip, 'id'>>): Promise<void> => {
    const batch = writeBatch(db);
    const tripRef = doc(db, 'trips', id);

    const fullTripDataForCalc: Omit<Trip, 'id'> = {
        // This is tricky, we need the full trip data to recalculate.
        // Let's fetch it first.
        ...(await getTrip(id))!,
        ...trip,
    };

    const netPay = calculateNetPay(fullTripDataForCalc);

    if (fullTripDataForCalc.salesTransactionId) {
        const transactionRef = doc(db, 'transactions', fullTripDataForCalc.salesTransactionId);
        batch.update(transactionRef, {
            amount: netPay,
            date: fullTripDataForCalc.date,
            vehicleId: fullTripDataForCalc.vehicleId,
            partyId: fullTripDataForCalc.partyId,
            lastModifiedBy: trip.lastModifiedBy,
            lastModifiedAt: new Date().toISOString(),
        });
    }

    batch.update(tripRef, {
        ...trip,
        lastModifiedAt: new Date().toISOString(),
    });
    
    await batch.commit();
};


export const deleteTrip = async (id: string): Promise<void> => {
    const trip = await getTrip(id);
    if (!trip) return;

    const batch = writeBatch(db);
    
    // Delete the trip itself
    const tripRef = doc(db, 'trips', id);
    batch.delete(tripRef);

    // Delete the associated sales transaction
    if (trip.salesTransactionId) {
        const transactionRef = doc(db, 'transactions', trip.salesTransactionId);
        batch.delete(transactionRef);
    }
    
    await batch.commit();
};
