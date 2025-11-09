
import { db } from '@/lib/firebase';
import { connectionPromiseInstance as connectionPromise } from '@/lib/firebase-connection';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, doc, updateDoc, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import type { Trip, Transaction } from '@/lib/types';
import { differenceInDays } from 'date-fns';

const tripsCollection = collection(db, 'trips');
const transactionsCollection = collection(db, 'transactions');

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

export const getTrips = async (forceFetch: boolean = false): Promise<Trip[]> => {
    await connectionPromise;
    const isDesktop = process.env.TAURI_BUILD === 'true';
    if (isDesktop && !forceFetch) {
        return [];
    }
    const snapshot = await getDocs(tripsCollection);
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

const BATCH_LIMIT = 499; // Firestore batch limit is 500

const commitBatch = async (batch: ReturnType<typeof writeBatch>) => {
    await batch.commit();
    return writeBatch(db); // Return a new batch
};


export const addTrip = async (trip: Omit<Trip, 'id' | 'createdAt' | 'salesTransactionId'>): Promise<string> => {
    await connectionPromise;
    let batch = writeBatch(db);
    let writeCount = 0;
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
        invoiceType: 'Taxable',
    };
    batch.set(salesTransactionRef, salesTransaction);
    writeCount++;

    const fuelEntriesWithPurchaseIds = [];
    for (const fuelEntry of trip.fuelEntries) {
        if (writeCount >= BATCH_LIMIT) {
            batch = await commitBatch(batch);
            writeCount = 0;
        }
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
    return tripRef.id;
};

export const onTripsUpdate = (callback: (trips: Trip[]) => void): () => void => {
    connectionPromise.then(() => {
        // Ready to listen
    }).catch(err => console.error("Firestore connection failed, not attaching listener", err));
    
    return onSnapshot(tripsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getTrip = async (id: string): Promise<Trip | null> => {
    await connectionPromise;
    if (!id || typeof id !== 'string') return null;
    const tripDoc = doc(db, 'trips', id);
    const docSnap = await getDoc(tripDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};

export const updateTrip = async (id: string, tripUpdate: Partial<Omit<Trip, 'id' | 'createdAt'>>): Promise<void> => {
    await connectionPromise;
    if (!id) return;
    let batch = writeBatch(db);
    let writeCount = 0;
    const tripRef = doc(db, 'trips', id);
    const now = new Date().toISOString();

    const originalTrip = await getTrip(id);
    if (!originalTrip) throw new Error("Trip not found");

    const fullTripDataForCalc: Omit<Trip, 'id' | 'createdAt'> = { ...originalTrip, ...tripUpdate };
    
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
            batch.delete(doc(db, 'transactions', oldEntry.purchaseTransactionId));
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
            writeCount++;
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
            writeCount++;
            fuelEntriesWithPurchaseIds.push({ ...fuelEntry, purchaseTransactionId: purchaseTransactionRef.id });
        }
    }
    
    if (writeCount >= BATCH_LIMIT) {
        batch = await commitBatch(batch);
        writeCount = 0;
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
    await connectionPromise;
    if (!id) return;
    let batch = writeBatch(db);
    let writeCount = 0;

    const trip = await getTrip(id);
    if (!trip) return;

    const allRefsToDelete = [];

    // Add associated sales transaction to delete list
    if (trip.salesTransactionId) {
        allRefsToDelete.push(doc(db, 'transactions', trip.salesTransactionId));
    }
    
    // Add associated fuel purchase transactions to delete list
    for (const fuelEntry of trip.fuelEntries) {
        if (fuelEntry.purchaseTransactionId) {
            allRefsToDelete.push(doc(db, 'transactions', fuelEntry.purchaseTransactionId));
        }
    }
    
    // Add the trip itself to delete list
    allRefsToDelete.push(doc(db, 'trips', id));

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
