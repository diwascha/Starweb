
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import type { NoteItem } from '@/lib/types';
import { subDays } from 'date-fns';

const notesCollection = collection(db, 'notes');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): NoteItem => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        type: data.type,
        title: data.title,
        content: data.content,
        isCompleted: data.isCompleted,
        completedAt: data.completedAt,
        dueDate: data.dueDate,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getNoteItems = async (forceFetch: boolean = false): Promise<NoteItem[]> => {
    const isDesktop = process.env.TAURI_BUILD === 'true';
    if (isDesktop && !forceFetch) {
        return [];
    }
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

export const cleanupOldItems = async (): Promise<number> => {
    const fourteenDaysAgo = subDays(new Date(), 14).toISOString();
    const now = new Date();

    const snapshot = await getDocs(notesCollection);
    const allItems = snapshot.docs.map(fromFirestore);

    const itemsToDelete = allItems.filter(item => {
        // Rule 1: Completed Todos older than 14 days
        if (item.type === 'Todo' && item.isCompleted && item.completedAt && item.completedAt < fourteenDaysAgo) {
            return true;
        }
        // Rule 2: Notes older than 14 days
        if (item.type === 'Note' && item.createdAt < fourteenDaysAgo) {
            return true;
        }
        // Rule 3: Past reminders
        if (item.type === 'Reminder' && item.dueDate && new Date(item.dueDate) < now) {
            return true;
        }
        return false;
    });

    if (itemsToDelete.length === 0) {
        return 0;
    }

    // Use batch writes for efficient deletion
    const batch = writeBatch(db);
    itemsToDelete.forEach(item => {
        const docRef = doc(db, 'notes', item.id);
        batch.delete(docRef);
    });

    await batch.commit();

    return itemsToDelete.length;
};
