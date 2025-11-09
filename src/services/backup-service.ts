
import { db } from '@/lib/firebase';
import { connectionPromise } from '@/lib/firebase-connection';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

const collectionsToBackup = [
    'reports',
    'products',
    'purchaseOrders',
    'rawMaterials',
    'employees',
    'attendance',
    'vehicles',
    'drivers',
    'policies',
    'transactions',
    'parties',
    'accounts',
    'uom',
    'destinations',
    'trips',
    'settings',
    'notes',
];

export const exportData = async (): Promise<Record<string, any[]>> => {
    await connectionPromise;
    const data: Record<string, any[]> = {};

    for (const collectionName of collectionsToBackup) {
        try {
            const querySnapshot = await getDocs(collection(db, collectionName));
            data[collectionName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching collection ${collectionName}:`, error);
        }
    }

    return data;
};

export const importData = async (data: Record<string, any[]>): Promise<void> => {
    await connectionPromise;
    // First, delete all existing data in the collections
    for (const collectionName of collectionsToBackup) {
        try {
            const querySnapshot = await getDocs(collection(db, collectionName));
            let deleteBatch = writeBatch(db);
            let deleteCount = 0;
            for (const document of querySnapshot.docs) {
                deleteBatch.delete(document.ref);
                deleteCount++;
                if (deleteCount === 499) {
                    await deleteBatch.commit();
                    deleteBatch = writeBatch(db);
                    deleteCount = 0;
                }
            }
            if (deleteCount > 0) {
                await deleteBatch.commit();
            }
        } catch (error) {
             console.error(`Error deleting collection ${collectionName}:`, error);
             throw new Error(`Failed to clear existing data in ${collectionName}.`);
        }
    }

    // Then, import the new data
    for (const collectionName in data) {
        if (collectionsToBackup.includes(collectionName)) {
            const collectionData = data[collectionName];
             let importBatch = writeBatch(db);
            let importCount = 0;
            for (const item of collectionData) {
                const { id, ...itemData } = item;
                const docRef = doc(db, collectionName, id);
                importBatch.set(docRef, itemData);
                importCount++;
                 if (importCount === 499) {
                    await importBatch.commit();
                    importBatch = writeBatch(db);
                    importCount = 0;
                }
            }
            if (importCount > 0) {
                await importBatch.commit();
            }
        }
    }
};
