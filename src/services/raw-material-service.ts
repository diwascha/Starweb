
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { RawMaterial } from '@/lib/types';

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

export const addRawMaterial = async (material: Omit<RawMaterial, 'id'>): Promise<string> => {
    const docRef = await addDoc(rawMaterialsCollection, material);
    return docRef.id;
};

export const getRawMaterials = async (): Promise<RawMaterial[]> => {
    const snapshot = await getDocs(rawMaterialsCollection);
    return snapshot.docs.map(fromFirestore);
};

export const updateRawMaterial = async (id: string, material: Partial<Omit<RawMaterial, 'id'>>): Promise<void> => {
    const materialDoc = doc(db, 'rawMaterials', id);
    await updateDoc(materialDoc, material);
};

export const deleteRawMaterial = async (id: string): Promise<void> => {
    const materialDoc = doc(db, 'rawMaterials', id);
    await deleteDoc(materialDoc);
};
