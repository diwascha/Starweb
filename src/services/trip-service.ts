import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, doc, updateDoc, deleteDoc, getDoc, writeBatch, query, where, setDoc } from 'firebase/firestore';
import type { Trip, Transaction } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { COLLECTIONS } from '@/lib/constants';

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

const BATCH_LIMIT = 499;

const commitBatch = async (batch: ReturnType<typeof writeBatch>) => {
    const { db } = getFirebase();
    await batch.commit();
    return writeBatch(db);
};


export const addTrip = async (trip: Omit<Trip, 'id' | 'createdAt' | 'salesTransactionId'>): Promise<string> => {
    const { db } = getFirebase();
    let batch = writeBatch(db);
    let writeCount = 0;
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
    writeCount++;

    const fuelEntriesWithPurchaseIds = [];
    for (const fuelEntry of trip.fuelEntries) {
        if (writeCount >= BATCH_LIMIT) {
            batch = await commitBatch(batch);
            writeCount = 0;
        }
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
        writeCount++;
        fuelEntriesWithPurchaseIds.push({ ...fuelEntry, purchaseTransactionId: purchaseTransactionRef.id });
    }

    if (writeCount >= BATCH_LIMIT) {
        batch = await commitBatch(batch);
        writeCount = 0;
    }

    const newTripData = {
      ...trip,
      fuelEntries: fuelEntriesWithPurchaseIds,
      createdAt: now,
      salesTransactionId: salesTransactionRef.id,
    };
    batch.set(tripRef, newTripData);
    writeCount++;

    await batch.commit();
    return tripId;
};

export const onTripsUpdate = (callback: (trips: Trip[]) => void): () => void => {
    return onSnapshot(getTripsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Trips):", error.message, error);
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
    let writeCount = 0;
    const tripRef = doc(getTripsCollection(), id);
    const now = new Date().toISOString();

    const originalTrip = await getTrip(id);
    if (!originalTrip) throw new Error("Trip not found");

    const fullTripDataForCalc: Omit<Trip, 'id' | 'createdAt'> = { ...originalTrip, ...tripUpdate };
    
    // 1. Update Sales Transaction
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
        writeCount++;
    }
    
    // 2. Handle Fuel Entries
    const newFuelEntries = tripUpdate.fuelEntries || [];
    const oldFuelEntries = originalTrip.fuelEntries || [];
    const fuelEntriesWithPurchaseIds = [];

    // Delete purchase transactions for removed fuel entries
    for (const oldEntry of oldFuelEntries) {
        if (oldEntry.purchaseTransactionId && !newFuelEntries.some(newEntry => newEntry.purchaseTransactionId === oldEntry.purchaseTransactionId)) {
            if (writeCount >= BATCH_LIMIT) {
                batch = await commitBatch(batch);
                writeCount = 0;
            }
            batch.delete(doc(getTransactionsCollection(), oldEntry.purchaseTransactionId));
            writeCount++;
        }
    }

    for (const fuelEntry of newFuelEntries) {
        if (writeCount >= BATCH_LIMIT) {
            batch = await commitBatch(batch);
            writeCount = 0;
        }

        if (fuelEntry.purchaseTransactionId) {
            // Update existing purchase transaction
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
            writeCount++;
            fuelEntriesWithPurchaseIds.push(fuelEntry);
        } else {
            // Create new purchase transaction
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
            writeCount++;
            fuelEntriesWithPurchaseIds.push({ ...fuelEntry, purchaseTransactionId: purchaseTransactionRef.id });
        }
    }
    
    if (writeCount >= BATCH_LIMIT) {
        batch = await commitBatch(batch);
        writeCount = 0;
    }

    // 3. Update the Trip document
    batch.update(tripRef, {
        ...tripUpdate,
        fuelEntries: fuelEntriesWithPurchaseIds,
        lastModifiedAt: now,
    });
    
    await batch.commit();
};


export const deleteTrip = async (id: string): Promise<void> => {
    if (!id) return;
    const { db } = getFirebase();
    let batch = writeBatch(db);
    let writeCount = 0;

    const trip = await getTrip(id);
    if (!trip) return;

    const allRefsToDelete = [];

    if (trip.salesTransactionId) {
        allRefsToDelete.push(doc(getTransactionsCollection(), trip.salesTransactionId));
    }
    
    for (const fuelEntry of trip.fuelEntries) {
        if (fuelEntry.purchaseTransactionId) {
            allRefsToDelete.push(doc(getTransactionsCollection(), fuelEntry.purchaseTransactionId));
        }
    }
    
    allRefsToDelete.push(doc(getTripsCollection(), id));

    for (const docRef of allRefsToDelete) {
        if (writeCount >= BATCH_LIMIT) {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        }
        batch.delete(docRef);
        writeCount++;
    }

    if (writeCount > 0) {
        await batch.commit();
    }
};
