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
    writeBatch,
    setDoc
} from 'firebase/firestore';
import type { RawMaterial, UnitOfMeasurement } from '@/lib/types';
import { getUoms, addUom } from './uom-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.RAW_MATERIALS,
            operation: 'list',
        }));
        throw error;
    }
};

export const addRawMaterial = async (material: Omit<RawMaterial, 'id'>): Promise<string> => {
    const docRef = doc(getRawMaterialsCollection());
    const payload = {
        ...material,
        createdAt: createTimestamp(),
    };

    setDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.RAW_MATERIALS,
            operation: 'create',
            requestResourceData: payload,
        }));
    });

    if (Array.isArray(material.units) && material.units.length > 0) {
        getUoms().then(async (existingUoms) => {
            const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
            for (const unit of material.units!) {
                if (!existingAbbrs.has(unit.toLowerCase())) {
                    await addUom({ 
                        name: unit, 
                        abbreviation: unit, 
                        createdBy: material.createdBy, 
                        createdAt: createTimestamp() 
                    });
                }
            }
        });
    }

    return docRef.id;
};

export const onRawMaterialsUpdate = (callback: (materials: RawMaterial[]) => void): () => void => {
    return onSnapshot(getRawMaterialsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.RAW_MATERIALS,
                operation: 'list',
            }));
        }
    );
};

export const updateRawMaterial = async (id: string, material: Partial<Omit<RawMaterial, 'id'>>): Promise<void> => {
    const materialDoc = doc(getRawMaterialsCollection(), id);
    const payload = {
        ...material,
        lastModifiedAt: createTimestamp()
    };

    updateDoc(materialDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: materialDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });

    if (Array.isArray(material.units) && material.units.length > 0 && material.lastModifiedBy) {
        getUoms().then(async (existingUoms) => {
            const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
            for (const unit of material.units!) {
                if (!existingAbbrs.has(unit.toLowerCase())) {
                    await addUom({ 
                        name: unit, 
                        abbreviation: unit, 
                        createdBy: material.lastModifiedBy!, 
                        createdAt: createTimestamp() 
                    });
                }
            }
        });
    }
};

export const deleteRawMaterial = async (id: string): Promise<void> => {
    const materialDoc = doc(getRawMaterialsCollection(), id);
    deleteDoc(materialDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: materialDoc.path,
            operation: 'delete',
        }));
    });
};

export const renameCategory = async (oldName: string, newName: string, modifiedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const q = query(getRawMaterialsCollection(), where("type", "==", oldName));
    
    getDocs(q).then(async (snapshot) => {
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
    }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'rawMaterials_rename_batch',
            operation: 'write',
        }));
    });
};

export const deleteCategory = async (name: string): Promise<void> => {
    const { db } = getFirebase();
    const q = query(getRawMaterialsCollection(), where("type", "==", name));
    
    getDocs(q).then(async (snapshot) => {
        if (snapshot.empty) return;
        const batch = writeBatch(db);
        snapshot.docs.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });
        await batch.commit();
    }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'rawMaterials_delete_batch',
            operation: 'write',
        }));
    });
};
