
import { storage } from '@/lib/firebase';
import { connectionPromise } from '@/lib/firebase-connection';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export const uploadFile = async (file: File, path: string): Promise<string> => {
    await connectionPromise;
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
};

export const deleteFile = async (fileUrl: string): Promise<void> => {
    await connectionPromise;
    const storageRef = ref(storage, fileUrl);
    await deleteObject(storageRef);
};
