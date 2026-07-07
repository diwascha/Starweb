/**
 * @fileOverview Trip service.
 * Refactored for non-blocking offline writes.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, doc, updateDoc, deleteDoc, getDoc, writeBatch, query, where, setDoc } from 'firebase/firestore';
import type { Trip, Transaction } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getTripsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.TRIPS);
}
const getTransactionsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.TRANSACTIONS);
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Trip => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        tripNumber: data.tripNumber,
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

export const getTrips = async (): Promise<Trip[]> => {
    const snapshot = await getDocs(getTripsCollection());
    return snapshot.docs.map(fromFirestore);
};

const calculateNetPay = (trip: Omit<Trip, 'id' | 'salesTransactionId' | 'createdAt'>): number => {
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
    const { db } = getFirebase();
    let batch = writeBatch(db);
    const now = new Date().toISOString();
    
    const tripId = doc(getTripsCollection()).id;
    const tripRef = doc(getTripsCollection(), tripId);

    const netPay = calculateNetPay(trip);
    const salesTransactionRef = doc(getTransactionsCollection());
    
    const salesTransaction: Omit<Transaction, 'id'> = {
        vehicleId: trip.vehicleId,
        date: trip.date,
        type: 'Sales',
        category: 'Freight',
        amount: netPay,
        items: [{ particular: `Sales from trip to ${trip.destinations[0]?.name || 'destination'}`, quantity: 1, rate: netPay }],
        partyId: trip.partyId,
        tripId: tripId,
        referenceType: "Trip Sheet",
        referenceId: trip.tripNumber,
        createdBy: trip.createdBy,
        createdAt: now,
        billingType: 'Credit',
        invoiceType: 'Taxable',
        lastModifiedAt: now,
        lastModifiedBy: null,
        invoiceDate: null,
        invoiceNumber: null,
        chequeDate: null,
        chequeNumber: null,
        dueDate: null,
        accountId: null,
        remarks: null,
    };
    batch.set(salesTransactionRef, salesTransaction);

    const fuelEntriesWithPurchaseIds = [];
    for (const fuelEntry of trip.fuelEntries) {
        const purchaseTransactionRef = doc(getTransactionsCollection());
        const purchaseTx: Omit<Transaction, 'id'> = {
            vehicleId: trip.vehicleId,
            partyId: fuelEntry.partyId,
            date: fuelEntry.invoiceDate || trip.date,
            invoiceNumber: fuelEntry.invoiceNumber || null,
            invoiceDate: fuelEntry.invoiceDate || null,
            type: 'Purchase',
            category: 'Fuel',
            billingType: 'Credit',
            invoiceType: 'Normal',
            amount: fuelEntry.amount,
            items: [{ particular: 'Fuel', quantity: fuelEntry.liters || 1, rate: fuelEntry.liters ? fuelEntry.amount / fuelEntry.liters : fuelEntry.amount }],
            remarks: `Fuel for trip ${trip.tripNumber}`,
            tripId: tripId,
            referenceType: "Trip Sheet",
            referenceId: trip.tripNumber,
            createdBy: trip.createdBy,
            createdAt: now,
            lastModifiedAt: now,
            lastModifiedBy: null,
            chequeDate: null,
            chequeNumber: null,
            dueDate: null,
            accountId: null,
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

    batch.commit().catch(async (err) => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'trip-creation-batch', operation: 'write' }));
    });

    return tripId;
};

export const onTripsUpdate = (callback: (trips: Trip[]) => void): () => void => {
    return onSnapshot(getTripsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRIPS, operation: 'list' }));
        }
    );
};

export const getTrip = async (id: string): Promise<Trip | null> => {
    if (!id || typeof id !== 'string') return null;
    const tripDoc = doc(getTripsCollection(), id);
    const docSnap = await getDoc(tripDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};

export const updateTrip = async (id: string, tripUpdate: Partial<Omit<Trip, 'id' | 'createdAt'>>): Promise<void> => {
    if (!id) return;
    const { db } = getFirebase();
    let batch = writeBatch(db);
    const tripRef = doc(getTripsCollection(), id);
    const now = new Date().toISOString();

    const originalTrip = await getTrip(id);
    if (!originalTrip) throw new Error("Trip not found");

    const fullTripDataForCalc: Omit<Trip, 'id' | 'createdAt'> = { ...originalTrip, ...tripUpdate };
    
    const netPay = calculateNetPay(fullTripDataForCalc);
    if (fullTripDataForCalc.salesTransactionId) {
        const transactionRef = doc(getTransactionsCollection(), fullTripDataForCalc.salesTransactionId);
        batch.update(transactionRef, {
            amount: netPay,
            date: fullTripDataForCalc.date,
            vehicleId: fullTripDataForCalc.vehicleId,
            partyId: fullTripDataForCalc.partyId,
            referenceId: fullTripDataForCalc.tripNumber,
            lastModifiedBy: tripUpdate.lastModifiedBy,
            lastModifiedAt: now,
        });
    }
    
    const newFuelEntries = tripUpdate.fuelEntries || [];
    const oldFuelEntries = originalTrip.fuelEntries || [];
    const fuelEntriesWithPurchaseIds = [];

    for (const oldEntry of oldFuelEntries) {
        if (oldEntry.purchaseTransactionId && !newFuelEntries.some(newEntry => newEntry.purchaseTransactionId === oldEntry.purchaseTransactionId)) {
            batch.delete(doc(getTransactionsCollection(), oldEntry.purchaseTransactionId));
        }
    }

    for (const fuelEntry of newFuelEntries) {
        if (fuelEntry.purchaseTransactionId) {
            const purchaseTxRef = doc(getTransactionsCollection(), fuelEntry.purchaseTransactionId);
            batch.update(purchaseTxRef, {
                vehicleId: fullTripDataForCalc.vehicleId,
                partyId: fuelEntry.partyId,
                date: fuelEntry.invoiceDate || fullTripDataForCalc.date,
                invoiceNumber: fuelEntry.invoiceNumber || null,
                invoiceDate: fuelEntry.invoiceDate || null,
                amount: fuelEntry.amount,
                referenceId: fullTripDataForCalc.tripNumber,
                items: [{ particular: 'Fuel', quantity: fuelEntry.liters || 1, rate: fuelEntry.liters ? fuelEntry.amount / fuelEntry.liters : fuelEntry.amount }],
                lastModifiedBy: tripUpdate.lastModifiedBy,
                lastModifiedAt: now,
            });
            fuelEntriesWithPurchaseIds.push(fuelEntry);
        } else {
            const purchaseTransactionRef = doc(getTransactionsCollection());
            const purchaseTx: Omit<Transaction, 'id'> = {
                vehicleId: fullTripDataForCalc.vehicleId,
                partyId: fuelEntry.partyId,
                date: fuelEntry.invoiceDate || fullTripDataForCalc.date,
                invoiceNumber: fuelEntry.invoiceNumber || null,
                invoiceDate: fuelEntry.invoiceDate || null,
                type: 'Purchase',
                category: 'Fuel',
                billingType: 'Credit',
                invoiceType: 'Normal',
                amount: fuelEntry.amount,
                items: [{ particular: 'Fuel', quantity: fuelEntry.liters || 1, rate: fuelEntry.liters ? fuelEntry.amount / fuelEntry.liters : fuelEntry.amount }],
                remarks: `Fuel for trip ${fullTripDataForCalc.tripNumber}`,
                tripId: id,
                referenceType: "Trip Sheet",
                referenceId: fullTripDataForCalc.tripNumber,
                createdBy: tripUpdate.lastModifiedBy || originalTrip.createdBy,
                createdAt: now,
                lastModifiedBy: tripUpdate.lastModifiedBy,
                lastModifiedAt: now,
            };
            batch.set(purchaseTransactionRef, purchaseTx);
            fuelEntriesWithPurchaseIds.push({ ...fuelEntry, purchaseTransactionId: purchaseTransactionRef.id });
        }
    }
    
    batch.update(tripRef, {
        ...tripUpdate,
        fuelEntries: fuelEntriesWithPurchaseIds,
        lastModifiedAt: now,
    });
    
    batch.commit().catch(async (err) => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'trip-update-batch', operation: 'write' }));
    });
};

export const deleteTrip = async (id: string): Promise<void> => {
    if (!id) return;
    const { db } = getFirebase();
    let batch = writeBatch(db);

    const trip = await getTrip(id);
    if (!trip) return;

    if (trip.salesTransactionId) {
        batch.delete(doc(getTransactionsCollection(), trip.salesTransactionId));
    }
    
    for (const fuelEntry of trip.fuelEntries) {
        if (fuelEntry.purchaseTransactionId) {
            batch.delete(doc(getTransactionsCollection(), fuelEntry.purchaseTransactionId));
        }
    }
    
    batch.delete(doc(getTripsCollection(), id));

    batch.commit().catch(async (err) => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'trip-deletion-batch', operation: 'write' }));
    });
};
