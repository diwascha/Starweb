

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, writeBatch, limit } from 'firebase/firestore';
import type { Party } from '@/lib/types';

const getPartiesCollection = () => {
    const { db } = getFirebase();
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
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (e) {
                console.error("Failed to parse cached parties:", e);
                sessionStorage.removeItem('parties');
            }
        }
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


export const mergeParties = async (sourceId: string, destinationId: string): Promise<void> => {
    const { db } = getFirebase();
    if (sourceId === destinationId) {
        throw new Error("Cannot merge a party into itself.");
    }

    const destinationDocRef = doc(db, 'parties', destinationId);
    const destinationSnap = await getDoc(destinationDocRef);
    if (!destinationSnap.exists()) {
        throw new Error("The party to merge into could not be found.");
    }
    const destinationParty = fromFirestore(destinationSnap);

    const sourceDocRef = doc(db, 'parties', sourceId);
    const sourceSnap = await getDoc(sourceDocRef);
    if (!sourceSnap.exists()) {
        throw new Error("The party to merge from could not be found.");
    }
    const sourceParty = fromFirestore(sourceSnap);

    const collectionsToUpdateById = [
        { name: 'purchaseOrders', field: 'partyId', payload: { partyId: destinationParty.id, companyName: destinationParty.name, companyAddress: destinationParty.address, panNumber: destinationParty.panNumber } },
        { name: 'products', field: 'partyId', payload: { partyId: destinationParty.id, partyName: destinationParty.name, partyAddress: destinationParty.address } },
        { name: 'costReports', field: 'partyId', payload: { partyId: destinationParty.id, partyName: destinationParty.name } },
        { name: 'trips', field: 'partyId', payload: { partyId: destinationParty.id } },
        { name: 'transactions', field: 'partyId', payload: { partyId: destinationParty.id } },
    ];
    
    const collectionsToUpdateByName = [
        { name: 'estimatedInvoices', field: 'partyName', payload: { partyName: destinationParty.name, panNumber: destinationParty.panNumber } },
        { name: 'cheques', field: 'partyName', payload: { partyName: destinationParty.name, payeeName: destinationParty.name } },
    ];

    const batch = writeBatch(db);

    for (const coll of collectionsToUpdateById) {
        const q = query(collection(db, coll.name), where(coll.field, "==", sourceId));
        const snapshot = await getDocs(q);
        snapshot.forEach(docToUpdate => {
            batch.update(docToUpdate.ref, coll.payload);
        });
    }

    for (const coll of collectionsToUpdateByName) {
        const q = query(collection(db, coll.name), where(coll.field, "==", sourceParty.name));
        const snapshot = await getDocs(q);
        snapshot.forEach(docToUpdate => {
            batch.update(docToUpdate.ref, coll.payload);
        });
    }

    // After updating all references, delete the source party
    batch.delete(sourceDocRef);

    await batch.commit();
};
