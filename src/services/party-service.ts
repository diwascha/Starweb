
import { db } from '@/lib/firebase';
import { connectionPromiseInstance as connectionPromise } from '@/lib/firebase-connection';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
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

export const getParties = async (forceFetch: boolean = false): Promise<Party[]> => {
    await connectionPromise;
    const isDesktop = process.env.TAURI_BUILD === 'true';
    if (isDesktop && !forceFetch) {
        return [];
    }
    const snapshot = await getDocs(partiesCollection);
    return snapshot.docs.map(fromFirestore);
};

export const getParty = async (id: string): Promise<Party | null> => {
    await connectionPromise;
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(db, 'parties', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    }
    return null;
}

export const getPartyByName = async (name: string): Promise<Party | null> => {
    await connectionPromise;
    if (!name || typeof name !== 'string') return null;
    const q = query(partiesCollection, where("name", "==", name), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        return fromFirestore(querySnapshot.docs[0]);
    }
    return null;
};


export const addParty = async (party: Omit<Party, 'id'>): Promise<string> => {
    await connectionPromise;
    const docRef = await addDoc(partiesCollection, {
        ...party,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onPartiesUpdate = (callback: (parties: Party[]) => void): () => void => {
    connectionPromise.then(() => {
        // Ready to listen
    }).catch(err => console.error("Firestore connection failed, not attaching listener", err));

    return onSnapshot(partiesCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateParty = async (id: string, party: Partial<Omit<Party, 'id'>>): Promise<void> => {
    await connectionPromise;
    if (!id) return;
    const partyDoc = doc(db, 'parties', id);
    await updateDoc(partyDoc, {
        ...party,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteParty = async (id: string): Promise<void> => {
    await connectionPromise;
    if (!id) return;
    const partyDoc = doc(db, 'parties', id);
    await deleteDoc(partyDoc);
};
