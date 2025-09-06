
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Party } from '@/lib/types';

const partiesCollection = collection(db, 'parties');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Party => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        type: data.type,
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
