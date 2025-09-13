
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, orderBy, query } from 'firebase/firestore';
import type { NoteItem } from '@/lib/types';

const notesCollection = collection(db, 'notes');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): NoteItem => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        type: data.type,
        title: data.title,
        content: data.content,
        isCompleted: data.isCompleted,
        dueDate: data.dueDate,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getNoteItems = async (): Promise<NoteItem[]> => {
    const q = query(notesCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
};

export const addNoteItem = async (item: Omit<NoteItem, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await addDoc(notesCollection, {
        ...item,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onNoteItemsUpdate = (callback: (items: NoteItem[]) => void): () => void => {
    const q = query(notesCollection, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateNoteItem = async (id: string, item: Partial<Omit<NoteItem, 'id'>>): Promise<void> => {
    const itemDoc = doc(db, 'notes', id);
    await updateDoc(itemDoc, {
        ...item,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteNoteItem = async (id: string): Promise<void> => {
    const itemDoc = doc(db, 'notes', id);
    await deleteDoc(itemDoc);
};
