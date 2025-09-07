
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Party } from '@/lib/types';

const partiesCollection = collection(db, 'parties');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Party => {
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
