import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, orderBy, query, writeBatch, setDoc } from 'firebase/firestore';
import type { NoteItem } from '@/lib/types';
import { subDays } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getNotesCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'notes');
}

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

export const addNoteItem = async (item: Omit<NoteItem, 'id' | 'createdAt'>): Promise<string> => {
    const payload = {
        ...item,
        createdAt: new Date().toISOString(),
    };
    // doc() mints the id locally; setDoc then writes without
    // blocking on the server, so this works offline too.
    const docRef = doc(getNotesCollection());
    reportWriteFailure(
        setDoc(docRef, payload),
    { path: 'notes', operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const onNoteItemsUpdate = (callback: (items: NoteItem[]) => void): () => void => {
    const q = query(getNotesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'notes',
                operation: 'list',
            }));
        }
    );
};

export const updateNoteItem = async (id: string, item: Partial<Omit<NoteItem, 'id'>>): Promise<void> => {
    const itemDoc = doc(getNotesCollection(), id);
    const payload = {
        ...item,
        lastModifiedAt: new Date().toISOString(),
    };
    reportWriteFailure(
        updateDoc(itemDoc, payload),
        { path: itemDoc.path, operation: 'update', requestResourceData: payload }
    );
};

export const deleteNoteItem = async (id: string): Promise<void> => {
    const itemDoc = doc(getNotesCollection(), id);
    reportWriteFailure(
        deleteDoc(itemDoc),
        { path: itemDoc.path, operation: 'delete' }
    );
};

export const cleanupOldItems = async (): Promise<number> => {
    const { db } = getFirebase();
    const fourteenDaysAgo = subDays(new Date(), 14).toISOString();
    const now = new Date();

    const snapshot = await getDocs(getNotesCollection());
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

    await batch.commit().catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'notes_cleanup_batch',
            operation: 'write',
        }));
    });

    return itemsToDelete.length;
};
