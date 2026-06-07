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

const getRawMaterialsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'rawMaterials');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): RawMaterial => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        type: data.type,
        name: data.name,
        size: data.size,
        gsm: data.gsm,
        bf: data.bf,
        units: data.units,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getRawMaterials = async (): Promise<RawMaterial[]> => {
    const snapshot = await getDocs(getRawMaterialsCollection());
    return snapshot.docs.map(fromFirestore);
};

// Function to consolidate units
const consolidateUnits = async (materials: RawMaterial[], createdBy: string = 'System') => {
    try {
        const existingUoms = await getUoms();
        const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
        const newUnitsToAdd = new Set<string>();

        materials.forEach(material => {
            if (Array.isArray(material.units)) {
                material.units.forEach(unit => {
                    if (unit && !existingAbbrs.has(unit.toLowerCase())) {
                        newUnitsToAdd.add(unit);
                    }
                });
            }
        });
        
        if (newUnitsToAdd.size > 0) {
            const promises = Array.from(newUnitsToAdd).map(abbr => {
                 const newUom: Omit<UnitOfMeasurement, 'id'> = {
                    name: abbr,
                    abbreviation: abbr,
                    createdBy: createdBy,
                    createdAt: new Date().toISOString()
                };
                return addUom(newUom);
            });
            await Promise.all(promises);
        }
    } catch (error) {
        console.error("Error during unit consolidation:", error);
    }
};

export const addRawMaterial = async (material: Omit<RawMaterial, 'id'>): Promise<string> => {
    if (material.units) {
      const existingUoms = await getUoms();
      const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
      for (const unit of material.units) {
        if (!existingAbbrs.has(unit.toLowerCase())) {
          await addUom({ name: unit, abbreviation: unit, createdBy: material.createdBy, createdAt: material.createdAt });
        }
      }
    }
    const docRef = await addDoc(getRawMaterialsCollection(), material);
    return docRef.id;
};

export const onRawMaterialsUpdate = (callback: (materials: RawMaterial[]) => void): () => void => {
    return onSnapshot(getRawMaterialsCollection(), 
        (snapshot) => {
            const materials = snapshot.docs.map(fromFirestore);
            consolidateUnits(materials);
            callback(materials);
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Raw Materials):", error.message, error);
        }
    );
};

export const updateRawMaterial = async (id: string, material: Partial<Omit<RawMaterial, 'id'>>): Promise<void> => {
    if (material.units && material.lastModifiedBy) {
      const existingUoms = await getUoms();
      const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
      for (const unit of material.units) {
        if (!existingAbbrs.has(unit.toLowerCase())) {
          await addUom({ name: unit, abbreviation: unit, createdBy: material.lastModifiedBy, createdAt: new Date().toISOString() });
        }
      }
    }
    const materialDoc = doc(getRawMaterialsCollection(), id);
    await updateDoc(materialDoc, material);
};

export const deleteRawMaterial = async (id: string): Promise<void> => {
    const materialDoc = doc(getRawMaterialsCollection(), id);
    await deleteDoc(materialDoc);
};

export const renameCategory = async (oldName: string, newName: string, modifiedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const q = query(getRawMaterialsCollection(), where("type", "==", oldName));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    const now = new Date().toISOString();

    snapshot.docs.forEach(docSnap => {
        batch.update(docSnap.ref, {
            type: newName,
            lastModifiedBy: modifiedBy,
            lastModifiedAt: now
        });
    });

    await batch.commit();
};

export const deleteCategory = async (name: string): Promise<void> => {
    const { db } = getFirebase();
    const q = query(getRawMaterialsCollection(), where("type", "==", name));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
    });

    await batch.commit();
};