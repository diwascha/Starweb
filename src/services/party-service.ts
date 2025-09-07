
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import type { Party } from '@/lib/types';

const partiesCollection = collection(db, 'parties');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Party => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        type: data.type,
        address: data.address,
        panNumber: data.panNumber,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getParty = async (id: string): Promise<Party | null> => {
    const docRef = doc(db, 'parties', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    }
    return null;
}

export const addParty = async (party: Omit<Party, 'id'>): Promise<string> => {
    const docRef = await addDoc(partiesCollection, {
        ...party,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onPartiesUpdate = (callback: (parties: Party[]) => void): () => void => {
    return onSnapshot(partiesCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateParty = async (id: string, party: Partial<Omit<Party, 'id'>>): Promise<void> => {
    const partyDoc = doc(db, 'parties', id);
    await updateDoc(partyDoc, {
        ...party,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteParty = async (id: string): Promise<void> => {
    const partyDoc = doc(db, 'parties', id);
    await deleteDoc(partyDoc);
};
