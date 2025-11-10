
import { getFirebase } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export const uploadFile = async (file: File, path: string): Promise<string> => {
    const { storage } = getFirebase();
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
};

export const deleteFile = async (fileUrl: string): Promise<void> => {
    const { storage } = getFirebase();
    const storageRef = ref(storage, fileUrl);
    await deleteObject(storageRef);
};
