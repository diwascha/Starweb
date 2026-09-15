import { getFirebase } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc, query, orderBy, limit } from 'firebase/firestore';

// Collections that are pure operational trails (grow with every click, not
// with real business records). Capped in backups so they don't dominate the
// file size; the most recent entries are kept for audit purposes.
const CAPPED_COLLECTIONS: Record<string, number> = {
    logs: 2000,
};

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
            const cap = CAPPED_COLLECTIONS[collectionName];
            const querySnapshot = cap
                ? await getDocs(query(collection(db, collectionName), orderBy('createdAt', 'desc'), limit(cap)))
                : await getDocs(collection(db, collectionName));
            data[collectionName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching collection ${collectionName}:`, error);
        }
    }

    return data;
};

// Backups are compressed client-side (gzip via the native CompressionStream
// API) since the raw JSON export can otherwise run into tens of MB. Falls
// back to plain, unindented JSON if the browser lacks CompressionStream.
export const compressBackup = async (data: unknown): Promise<{ blob: Blob; gzipped: boolean }> => {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    if (typeof CompressionStream === 'undefined') {
        return { blob: new Blob([bytes], { type: 'application/json' }), gzipped: false };
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const blob = await new Response(stream).blob();
    return { blob, gzipped: true };
};

// Reads a backup file produced by compressBackup (gzip) or a legacy
// plain-JSON backup, and returns the parsed data.
export const readBackupFile = async (file: File): Promise<Record<string, any[]>> => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    let jsonText: string;
    if (isGzip) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('This browser cannot decompress gzip backups. Please use an up-to-date browser.');
        }
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        jsonText = await new Response(stream).text();
    } else {
        jsonText = new TextDecoder().decode(buffer);
    }
    return JSON.parse(jsonText);
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
