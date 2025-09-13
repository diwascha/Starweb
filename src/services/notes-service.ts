
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, orderBy, query } from 'firebase/firestore';
import type { Todo } from '@/lib/types';

const todosCollection = collection(db, 'todos');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Todo => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        content: data.content,
        isCompleted: data.isCompleted,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getTodos = async (): Promise<Todo[]> => {
    const q = query(todosCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
};

export const addTodo = async (todo: Omit<Todo, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await addDoc(todosCollection, {
        ...todo,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onTodosUpdate = (callback: (todos: Todo[]) => void): () => void => {
    const q = query(todosCollection, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateTodo = async (id: string, todo: Partial<Omit<Todo, 'id'>>): Promise<void> => {
    const todoDoc = doc(db, 'todos', id);
    await updateDoc(todoDoc, {
        ...todo,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteTodo = async (id: string): Promise<void> => {
    const todoDoc = doc(db, 'todos', id);
    await deleteDoc(todoDoc);
};
