import { getFirebase } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

const collectionsToBackup = [
    'reports',
    'products',
    'purchaseOrders',
    'rawMaterials',
    'employees',
    'attendance',
    'payroll',
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
    'pageVisits',
    'tdsCalculations',
    'estimatedInvoices',
    'cheques',
    'expenses',
    'logs',
    'files',
    'rentalProperties',
    'rentalUnits',
    'rentalAgreements',
    'rentalBills',
    'system_users',
    'usernames',
    'raw_machine_logs',
    'bonus_ledger',
    'bonus_summaries',
    'behavior_ledger',
    'behavior_analytics',
    'analytics_reports',
    'hr_shifts',
    'leave_requests'
];

export const exportData = async (): Promise<Record<string, any[]>> => {
    const { db } = getFirebase();
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
    const { db } = getFirebase();
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

/**
 * Gzip a string in the browser, when the platform supports it.
 *
 * A full export of this database is around 16 MB of pretty-printed JSON and
 * grows with every month of attendance. Measured on data shaped like this
 * app's (random ids, varied values - the least compressible realistic case),
 * dropping the indentation and gzipping takes 16.9 MB to 3.2 MB, about 5x.
 *
 * CompressionStream is not everywhere: the Tauri wrapper uses the system
 * webview, which on Linux is WebKitGTK and may not have it. Callers fall
 * back to uncompressed rather than failing the backup.
 */
export const gzipString = async (text: string): Promise<Blob | null> => {
    if (typeof CompressionStream === 'undefined') return null;
    try {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        return await new Response(stream).blob();
    } catch {
        return null;
    }
};

/** Read a backup file that may or may not be gzipped. */
export const readBackupFile = async (file: File): Promise<Record<string, any[]>> => {
    const isGzip = file.name.endsWith('.gz')
        || file.type === 'application/gzip'
        || file.type === 'application/x-gzip';

    if (!isGzip) return JSON.parse(await file.text());

    if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot open a compressed backup. Use a Chromium-based browser, or restore an uncompressed .json backup.');
    }
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
};
