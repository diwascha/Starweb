import { getFirebase } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage.
 * Note: If you encounter CORS errors on 'starsutra.vercel.app', you must configure
 * the CORS policy on your Firebase Storage bucket via the Google Cloud Console.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
    const { storage } = getFirebase();
    const storageRef = ref(storage, path);
    
    try {
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error: any) {
        console.error("Firebase Storage Upload Error:", error);
        
        // Enhance error message for CORS issues
        if (error.code === 'storage/unauthorized' || error.message?.includes('CORS') || error.status === 403) {
            throw new Error(`Storage Access Blocked: Please ensure CORS is configured in Firebase Console for bucket: ${storage.app.options.storageBucket}`);
        }
        
        throw error;
    }
};

export const deleteFile = async (fileUrl: string): Promise<void> => {
    const { storage } = getFirebase();
    // Extract path from download URL
    try {
        const decodedUrl = decodeURIComponent(fileUrl);
        const pathStart = decodedUrl.indexOf('/o/') + 3;
        const pathEnd = decodedUrl.indexOf('?');
        const path = decodedUrl.substring(pathStart, pathEnd);
        
        const storageRef = ref(storage, path);
        await deleteObject(storageRef);
    } catch (error) {
        console.warn("Delete file skipped: Invalid URL or file not found.", error);
    }
};
