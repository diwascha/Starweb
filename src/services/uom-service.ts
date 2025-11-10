
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { UnitOfMeasurement } from '@/lib/types';

const getUomCollection = () => {
    return collection(db, 'uom');
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): UnitOfMeasurement => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        abbreviation: data.abbreviation,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getUoms = async (): Promise<UnitOfMeasurement[]> => {
    const snapshot = await getDocs(getUomCollection());
    return snapshot.docs.map(fromFirestore);
};

export const addUom = async (uom: Omit<UnitOfMeasurement, 'id'>): Promise<string> => {
    const docRef = await addDoc(getUomCollection(), {
        ...uom,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onUomsUpdate = (callback: (uoms: UnitOfMeasurement[]) => void): () => void => {
    return onSnapshot(getUomCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (UoM):", error.message, error);
        }
    );
};

export const updateUom = async (id: string, uom: Partial<Omit<UnitOfMeasurement, 'id'>>): Promise<void> => {
    if (!id) return;
    const uomDoc = doc(getUomCollection(), id);
    await updateDoc(uomDoc, {
        ...uom,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteUom = async (id: string): Promise<void> => {
    if (!id) return;
    const uomDoc = doc(getUomCollection(), id);
    await deleteDoc(uomDoc);
};
