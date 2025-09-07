
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

const calculateNetPay = (trip: Omit<Trip, 'id' | 'salesTransactionId'>): number => {
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


export const addTrip = async (trip: Omit<Trip, 'id' | 'createdAt' | 'salesTransactionId'>): Promise<string> => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    
    const tripRef = doc(collection(db, 'trips'));

    const netPay = calculateNetPay(trip);
    const salesTransactionRef = doc(collection(db, 'transactions'));
    
    const salesTransaction: Omit<Transaction, 'id'> = {
        vehicleId: trip.vehicleId,
        date: trip.date,
        type: 'Sales',
        amount: netPay,
        items: [{ particular: `Sales from trip to ${trip.destinations[0]?.name || 'destination'}`, quantity: 1, rate: netPay }],
        partyId: trip.partyId,
        tripId: tripRef.id,
        createdBy: trip.createdBy,
        createdAt: now,
        billingType: 'Credit',
        invoiceType: 'Taxable'
    };
    batch.set(salesTransactionRef, salesTransaction);

    const fuelEntriesWithPurchaseIds = [];
    for (const fuelEntry of trip.fuelEntries) {
        const purchaseTransactionRef = doc(collection(db, 'transactions'));
        const purchaseTx: Omit<Transaction, 'id'> = {
            vehicleId: trip.vehicleId,
            partyId: fuelEntry.partyId,
            date: fuelEntry.invoiceDate || trip.date,
            invoiceNumber: fuelEntry.invoiceNumber || null,
            invoiceDate: fuelEntry.invoiceDate || null,
            type: 'Purchase',
            billingType: 'Credit',
            invoiceType: 'Normal',
            amount: fuelEntry.amount,
            items: [{ particular: 'Fuel', quantity: fuelEntry.liters || 1, rate: fuelEntry.liters ? fuelEntry.amount / fuelEntry.liters : fuelEntry.amount }],
            remarks: `Fuel for trip ${tripRef.id}`,
            tripId: tripRef.id,
            createdBy: trip.createdBy,
            createdAt: now,
        };
        batch.set(purchaseTransactionRef, purchaseTx);
        fuelEntriesWithPurchaseIds.push({ ...fuelEntry, purchaseTransactionId: purchaseTransactionRef.id });
    }

    const newTripData = {
      ...trip,
      fuelEntries: fuelEntriesWithPurchaseIds,
      createdAt: now,
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

export const updateTrip = async (id: string, tripUpdate: Partial<Omit<Trip, 'id'>>): Promise<void> => {
    const batch = writeBatch(db);
    const tripRef = doc(db, 'trips', id);
    const now = new Date().toISOString();

    const originalTrip = await getTrip(id);
    if (!originalTrip) throw new Error("Trip not found");

    const fullTripDataForCalc: Omit<Trip, 'id'> = { ...originalTrip, ...tripUpdate };
    
    // 1. Update Sales Transaction
    const netPay = calculateNetPay(fullTripDataForCalc);
    if (fullTripDataForCalc.salesTransactionId) {
        const transactionRef = doc(db, 'transactions', fullTripDataForCalc.salesTransactionId);
        batch.update(transactionRef, {
            amount: netPay,
            date: fullTripDataForCalc.date,
            vehicleId: fullTripDataForCalc.vehicleId,
            partyId: fullTripDataForCalc.partyId,
            lastModifiedBy: tripUpdate.lastModifiedBy,
            lastModifiedAt: now,
        });
    }
    
    // 2. Handle Fuel Entries
    const newFuelEntries = tripUpdate.fuelEntries || [];
    const oldFuelEntries = originalTrip.fuelEntries || [];
    const fuelEntriesWithPurchaseIds = [];

    // Delete purchase transactions for removed fuel entries
    for (const oldEntry of oldFuelEntries) {
        if (oldEntry.purchaseTransactionId && !newFuelEntries.some(newEntry => newEntry.purchaseTransactionId === oldEntry.purchaseTransactionId)) {
            batch.delete(doc(db, 'transactions', oldEntry.purchaseTransactionId));
        }
    }

    for (const fuelEntry of newFuelEntries) {
        if (fuelEntry.purchaseTransactionId) {
            // Update existing purchase transaction
            const purchaseTxRef = doc(db, 'transactions', fuelEntry.purchaseTransactionId);
            batch.update(purchaseTxRef, {
                vehicleId: fullTripDataForCalc.vehicleId,
                partyId: fuelEntry.partyId,
                date: fuelEntry.invoiceDate || fullTripDataForCalc.date,
                invoiceNumber: fuelEntry.invoiceNumber || null,
                invoiceDate: fuelEntry.invoiceDate || null,
                amount: fuelEntry.amount,
                items: [{ particular: 'Fuel', quantity: fuelEntry.liters || 1, rate: fuelEntry.liters ? fuelEntry.amount / fuelEntry.liters : fuelEntry.amount }],
                lastModifiedBy: tripUpdate.lastModifiedBy,
                lastModifiedAt: now,
            });
            fuelEntriesWithPurchaseIds.push(fuelEntry);
        } else {
            // Create new purchase transaction for new fuel entry
            const purchaseTransactionRef = doc(collection(db, 'transactions'));
            const purchaseTx: Omit<Transaction, 'id'> = {
                vehicleId: fullTripDataForCalc.vehicleId,
                partyId: fuelEntry.partyId,
                date: fuelEntry.invoiceDate || fullTripDataForCalc.date,
                invoiceNumber: fuelEntry.invoiceNumber || null,
                invoiceDate: fuelEntry.invoiceDate || null,
                type: 'Purchase',
                billingType: 'Credit',
                invoiceType: 'Normal',
                amount: fuelEntry.amount,
                items: [{ particular: 'Fuel', quantity: fuelEntry.liters || 1, rate: fuelEntry.liters ? fuelEntry.amount / fuelEntry.liters : fuelEntry.amount }],
                remarks: `Fuel for trip ${id}`,
                tripId: id,
                createdBy: tripUpdate.lastModifiedBy || originalTrip.createdBy,
                createdAt: now,
                lastModifiedBy: tripUpdate.lastModifiedBy,
                lastModifiedAt: now,
            };
            batch.set(purchaseTransactionRef, purchaseTx);
            fuelEntriesWithPurchaseIds.push({ ...fuelEntry, purchaseTransactionId: purchaseTransactionRef.id });
        }
    }

    // 3. Update the Trip document itself
    batch.update(tripRef, {
        ...tripUpdate,
        fuelEntries: fuelEntriesWithPurchaseIds,
        lastModifiedAt: now,
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
    
    // Delete associated fuel purchase transactions
    for (const fuelEntry of trip.fuelEntries) {
        if (fuelEntry.purchaseTransactionId) {
            const purchaseTxRef = doc(db, 'transactions', fuelEntry.purchaseTransactionId);
            batch.delete(purchaseTxRef);
        }
    }

    await batch.commit();
};
