
'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';

export interface FileRecord {
    id: string;
    name: string;
    url: string;
    size: number;
    type: string;
    path: string;
    uploadedBy: string;
    uploadedAt: string;
    category: 'General' | 'HR' | 'Fleet' | 'Finance' | 'CRM';
}

const getFilesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.FILES || 'files');
};

export const onFilesUpdate = (callback: (files: FileRecord[]) => void) => {
    const q = query(getFilesCollection(), orderBy('uploadedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const files = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FileRecord));
        callback(files);
    });
};

export const addFileRecord = async (data: Omit<FileRecord, 'id'>) => {
    return await addDoc(getFilesCollection(), {
        ...data,
        uploadedAt: new Date().toISOString()
    });
};

export const removeFileRecord = async (id: string) => {
    await deleteDoc(doc(getFilesCollection(), id));
};
