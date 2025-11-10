
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import type { Party } from '@/lib/types';

const getPartiesCollection = () => {
    return collection(db, 'parties');
};


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

export const getParties = async (useCache = false): Promise<Party[]> => {
    if (useCache && typeof window !== 'undefined') {
        const cached = sessionStorage.getItem('parties');
        if (cached) return JSON.parse(cached);
    }
    const snapshot = await getDocs(getPartiesCollection());
    const parties = snapshot.docs.map(fromFirestore);
     if (typeof window !== 'undefined') {
        sessionStorage.setItem('parties', JSON.stringify(parties));
    }
    return parties;
};

export const getParty = async (id: string): Promise<Party | null> => {
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(getPartiesCollection(), id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    }
    return null;
}

export const getPartyByName = async (name: string): Promise<Party | null> => {
    if (!name || typeof name !== 'string') return null;
    const q = query(getPartiesCollection(), where("name", "==", name), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        return fromFirestore(querySnapshot.docs[0]);
    }
    return null;
};


export const addParty = async (party: Omit<Party, 'id'>): Promise<string> => {
    const docRef = await addDoc(getPartiesCollection(), {
        ...party,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onPartiesUpdate = (callback: (parties: Party[]) => void): () => void => {
    return onSnapshot(getPartiesCollection(), 
        (snapshot) => {
            const parties = snapshot.docs.map(fromFirestore);
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('parties', JSON.stringify(parties));
            }
            callback(parties);
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Parties):", error.message, error);
        }
    );
};

export const updateParty = async (id: string, party: Partial<Omit<Party, 'id'>>): Promise<void> => {
    if (!id) return;
    const partyDoc = doc(getPartiesCollection(), id);
    await updateDoc(partyDoc, {
        ...party,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteParty = async (id: string): Promise<void> => {
    if (!id) return;
    const partyDoc = doc(getPartiesCollection(), id);
    await deleteDoc(partyDoc);
};
