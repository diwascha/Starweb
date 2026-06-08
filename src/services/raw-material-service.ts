
import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot,
    query,
    where,
    writeBatch
} from 'firebase/firestore';
import type { RawMaterial, UnitOfMeasurement } from '@/lib/types';
import { getUoms, addUom } from './uom-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';

const getRawMaterialsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.RAW_MATERIALS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): RawMaterial => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        type: String(data.type || ''),
        name: String(data.name || ''),
        size: String(data.size || ''),
        gsm: String(data.gsm || ''),
        bf: String(data.bf || ''),
        units: Array.isArray(data.units) ? data.units : [],
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getRawMaterials = async (): Promise<RawMaterial[]> => {
    try {
        const snapshot = await getDocs(getRawMaterialsCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        logServiceError('getRawMaterials', error);
        throw error;
    }
};

export const addRawMaterial = async (material: Omit<RawMaterial, 'id'>): Promise<string> => {
    try {
        if (material.units) {
            const existingUoms = await getUoms();
            const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
            for (const unit of material.units) {
                if (!existingAbbrs.has(unit.toLowerCase())) {
                    await addUom({ 
                        name: unit, 
                        abbreviation: unit, 
                        createdBy: material.createdBy, 
                        createdAt: createTimestamp() 
                    });
                }
            }
        }
        const docRef = await addDoc(getRawMaterialsCollection(), material);
        return docRef.id;
    } catch (error) {
        logServiceError('addRawMaterial', error);
        throw error;
    }
};

export const onRawMaterialsUpdate = (callback: (materials: RawMaterial[]) => void): () => void => {
    return onSnapshot(getRawMaterialsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            logServiceError('onRawMaterialsUpdate', error);
        }
    );
};

export const updateRawMaterial = async (id: string, material: Partial<Omit<RawMaterial, 'id'>>): Promise<void> => {
    try {
        if (material.units && material.lastModifiedBy) {
            const existingUoms = await getUoms();
            const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
            for (const unit of material.units) {
                if (!existingAbbrs.has(unit.toLowerCase())) {
                    await addUom({ 
                        name: unit, 
                        abbreviation: unit, 
                        createdBy: material.lastModifiedBy, 
                        createdAt: createTimestamp() 
                    });
                }
            }
        }
        const materialDoc = doc(getRawMaterialsCollection(), id);
        await updateDoc(materialDoc, {
            ...material,
            lastModifiedAt: createTimestamp()
        });
    } catch (error) {
        logServiceError('updateRawMaterial', error);
        throw error;
    }
};

export const deleteRawMaterial = async (id: string): Promise<void> => {
    try {
        const materialDoc = doc(getRawMaterialsCollection(), id);
        await deleteDoc(materialDoc);
    } catch (error) {
        logServiceError('deleteRawMaterial', error);
        throw error;
    }
};

export const renameCategory = async (oldName: string, newName: string, modifiedBy: string): Promise<void> => {
    const { db } = getFirebase();
    try {
        const q = query(getRawMaterialsCollection(), where("type", "==", oldName));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) return;

        const batch = writeBatch(db);
        const now = createTimestamp();

        snapshot.docs.forEach(docSnap => {
            batch.update(docSnap.ref, {
                type: newName,
                lastModifiedBy: modifiedBy,
                lastModifiedAt: now
            });
        });

        await batch.commit();
    } catch (error) {
        logServiceError('renameCategory', error);
        throw error;
    }
};

export const deleteCategory = async (name: string): Promise<void> => {
    const { db } = getFirebase();
    try {
        const q = query(getRawMaterialsCollection(), where("type", "==", name));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) return;

        const batch = writeBatch(db);
        snapshot.docs.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });

        await batch.commit();
    } catch (error) {
        logServiceError('deleteCategory', error);
        throw error;
    }
};
