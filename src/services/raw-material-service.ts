
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { RawMaterial, UnitOfMeasurement } from '@/lib/types';
import { getUoms, addUom } from './uom-service';

const rawMaterialsCollection = collection(db, 'rawMaterials');

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
    const snapshot = await getDocs(rawMaterialsCollection);
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
            console.log(`Found ${newUnitsToAdd.size} new units to add:`, Array.from(newUnitsToAdd));
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
            console.log("Successfully added new units to the UoM collection.");
        }
    } catch (error) {
        console.error("Error during unit consolidation:", error);
    }
};


export const addRawMaterial = async (material: Omit<RawMaterial, 'id'>): Promise<string> => {
    // Consolidate units before adding new material
    if (material.units) {
      const existingUoms = await getUoms();
      const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
      for (const unit of material.units) {
        if (!existingAbbrs.has(unit.toLowerCase())) {
          await addUom({ name: unit, abbreviation: unit, createdBy: material.createdBy, createdAt: material.createdAt });
        }
      }
    }
    const docRef = await addDoc(rawMaterialsCollection, material);
    return docRef.id;
};

export const onRawMaterialsUpdate = (callback: (materials: RawMaterial[]) => void): () => void => {
    return onSnapshot(rawMaterialsCollection, 
        (snapshot) => {
            const materials = snapshot.docs.map(fromFirestore);
            // Consolidate units in the background
            consolidateUnits(materials);
            callback(materials);
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Raw Materials):", error.message, error);
        }
    );
};

export const updateRawMaterial = async (id: string, material: Partial<Omit<RawMaterial, 'id'>>): Promise<void> => {
    // Consolidate units before updating material
    if (material.units && material.lastModifiedBy) {
      const existingUoms = await getUoms();
      const existingAbbrs = new Set(existingUoms.map(u => u.abbreviation.toLowerCase()));
      for (const unit of material.units) {
        if (!existingAbbrs.has(unit.toLowerCase())) {
          await addUom({ name: unit, abbreviation: unit, createdBy: material.lastModifiedBy, createdAt: new Date().toISOString() });
        }
      }
    }
    const materialDoc = doc(db, 'rawMaterials', id);
    await updateDoc(materialDoc, material);
};

export const deleteRawMaterial = async (id: string): Promise<void> => {
    const materialDoc = doc(db, 'rawMaterials', id);
    await deleteDoc(materialDoc);
};
