
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

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
    const data: Record<string, any[]> = {};

    for (const collectionName of collectionsToBackup) {
        try {
            const querySnapshot = await getDocs(collection(db, collectionName));
            data[collectionName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching collection ${collectionName}:`, error);
            // Optionally, you can decide to either continue or throw an error
            // For now, we'll just log it and continue
        }
    }

    return data;
};
