/**
 * @fileOverview Trip service.
 * Refactored for deterministic ledger tracking and non-blocking offline writes.
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDoc, 
    writeBatch, 
    query, 
    where, 
    setDoc,
    getDocFromCache
} from 'firebase/firestore';
import type { Trip, Transaction } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { createTimestamp } from '@/lib/service-utils';

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

const calculateNetPay = (trip: any): number => {
    const days = trip.detentionStartDate && trip.detentionEndDate ? differenceInDays(new Date(trip.detentionEndDate), new Date(trip.detentionStartDate)) + 1 : 0;
    const totalFreight = (trip.destinations || []).reduce((sum: number, dest: any) => sum + (Number(dest.freight) || 0), 0);
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
    const batch = writeBatch(db);
    const now = createTimestamp();
    const tripId = doc(getTripsCollection()).id;
    const salesTxnId = `sales-${trip.tripNumber}`;

    const netPay = calculateNetPay(trip);
    
    const salesTransaction: Omit<Transaction, 'id'> = {
        vehicleId: trip.vehicleId,
        date: trip.date,
        type: 'Sales',
        category: 'Freight',
        amount: netPay,
        items: [{ particular: `Freight: ${trip.destinations[0]?.name || 'Unknown'}`, quantity: 1, rate: netPay }],
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
    batch.set(doc(getTransactionsCollection(), salesTxnId), salesTransaction);

    const fuelEntriesWithPurchaseIds = (trip.fuelEntries || []).map((f, i) => {
        const purchaseTxnId = `fuel-${trip.tripNumber}-${i}`;
        const purchaseTx: Omit<Transaction, 'id'> = {
            vehicleId: trip.vehicleId,
            partyId: f.partyId,
            date: f.invoiceDate || trip.date,
            type: 'Purchase',
            category: 'Fuel',
            billingType: 'Credit',
            invoiceType: 'Normal',
            amount: f.amount,
            items: [{ particular: 'Fuel Purchase', quantity: f.liters || 1, rate: f.liters ? f.amount / f.liters : f.amount }],
            tripId: tripId,
            referenceType: "Trip Sheet",
            referenceId: trip.tripNumber,
            createdBy: trip.createdBy,
            createdAt: now,
            lastModifiedAt: now,
            lastModifiedBy: null,
            invoiceNumber: f.invoiceNumber || null,
            invoiceDate: f.invoiceDate || null,
            chequeDate: null,
            chequeNumber: null,
            dueDate: null,
            accountId: null,
            remarks: null,
        };
        batch.set(doc(getTransactionsCollection(), purchaseTxnId), purchaseTx);
        return { ...f, purchaseTransactionId: purchaseTxnId };
    });

    const newTripData = {
      ...trip,
      fuelEntries: fuelEntriesWithPurchaseIds,
      createdAt: now,
      salesTransactionId: salesTxnId,
    };
    batch.set(doc(getTripsCollection(), tripId), newTripData);

    batch.commit().catch(err => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'trips', operation: 'write' }));
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
    if (!id) return null;
    const docRef = doc(getTripsCollection(), id);
    try {
        const snap = await getDoc(docRef);
        return snap.exists() ? fromFirestore(snap) : null;
    } catch {
        try {
            const cacheSnap = await getDocFromCache(docRef);
            return cacheSnap.exists() ? fromFirestore(cacheSnap) : null;
        } catch {
            return null;
        }
    }
};

export const updateTrip = async (id: string, tripUpdate: Partial<Omit<Trip, 'id' | 'createdAt'>>): Promise<void> => {
    if (!id) return;
    const { db } = getFirebase();
    const tripRef = doc(getTripsCollection(), id);
    const snap = await getDoc(tripRef);
    if (!snap.exists()) throw new Error("Trip not found");

    const oldTrip = snap.data() as Trip;
    const newTrip = { ...oldTrip, ...tripUpdate };
    const now = createTimestamp();
    const batch = writeBatch(db);

    const netPay = calculateNetPay(newTrip);
    
    // Update main sales record (Deterministic ID)
    batch.set(doc(getTransactionsCollection(), `sales-${newTrip.tripNumber}`), {
        vehicleId: newTrip.vehicleId,
        date: newTrip.date,
        type: 'Sales',
        category: 'Freight',
        amount: netPay,
        items: [{ particular: `Freight: ${newTrip.destinations[0]?.name || 'Unknown'}`, quantity: 1, rate: netPay }],
        partyId: newTrip.partyId,
        tripId: id,
        referenceType: "Trip Sheet",
        referenceId: newTrip.tripNumber,
        createdBy: oldTrip.createdBy,
        lastModifiedBy: tripUpdate.lastModifiedBy || null,
        lastModifiedAt: now,
        createdAt: oldTrip.createdAt,
        billingType: 'Credit',
        invoiceType: 'Taxable',
    }, { merge: true });

    // Handle fuel entries
    const fuelEntriesWithIds = (newTrip.fuelEntries || []).map((f, i) => {
        const purchaseTxnId = `fuel-${newTrip.tripNumber}-${i}`;
        batch.set(doc(getTransactionsCollection(), purchaseTxnId), {
            vehicleId: newTrip.vehicleId,
            partyId: f.partyId,
            date: f.invoiceDate || newTrip.date,
            type: 'Purchase',
            category: 'Fuel',
            amount: f.amount,
            items: [{ particular: 'Fuel Purchase', quantity: f.liters || 1, rate: f.liters ? f.amount / f.liters : f.amount }],
            tripId: id,
            referenceType: "Trip Sheet",
            referenceId: newTrip.tripNumber,
            lastModifiedBy: tripUpdate.lastModifiedBy || null,
            lastModifiedAt: now,
            invoiceNumber: f.invoiceNumber || null,
            invoiceDate: f.invoiceDate || null,
        }, { merge: true });
        return { ...f, purchaseTransactionId: purchaseTxnId };
    });

    batch.update(tripRef, {
        ...tripUpdate,
        fuelEntries: fuelEntriesWithIds,
        lastModifiedAt: now,
    });

    batch.commit().catch(err => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({ path: tripRef.path, operation: 'update' }));
    });
};

export const deleteTrip = async (id: string): Promise<void> => {
    const { db } = getFirebase();
    const tripRef = doc(getTripsCollection(), id);
    const snap = await getDoc(tripRef);
    if (!snap.exists()) return;

    const trip = snap.data() as Trip;
    const batch = writeBatch(db);

    batch.delete(tripRef);
    batch.delete(doc(getTransactionsCollection(), `sales-${trip.tripNumber}`));
    (trip.fuelEntries || []).forEach((_, i) => {
        batch.delete(doc(getTransactionsCollection(), `fuel-${trip.tripNumber}-${i}`));
    });

    batch.commit().catch(err => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({ path: tripRef.path, operation: 'delete' }));
    });
};
