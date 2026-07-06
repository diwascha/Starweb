import { getFirebase } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage.
 * Note: If you encounter CORS errors or "Access Denied", ensure you have:
 * 1. Enabled Firebase Storage in the Console.
 * 2. Set the bucket rules to allow reads/writes.
 * 3. Configured CORS for your domain using gsutil or Google Cloud Shell.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
    const { storage } = getFirebase();
    const storageRef = ref(storage, path);
    
    try {
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error: any) {
        console.error("Firebase Storage Error:", error);
        
        // Human-readable error mapping for common setup issues
        if (error.code === 'storage/unauthorized') {
            throw new Error(`Security Denied: Please check your Firebase Storage Rules. You may need to enable the service in the Firebase Console.`);
        }
        if (error.code === 'storage/retry-limit-exceeded' || error.message?.includes('CORS')) {
            throw new Error(`Connection Blocked (CORS): Firebase Storage requires your domain to be authorized in the Google Cloud Console.`);
        }
        if (error.status === 403) {
            throw new Error(`Access Forbidden: Ensure your Firebase project is not over its daily free-tier limit or has Storage enabled.`);
        }
        
        throw new Error(error.message || "Failed to communicate with Cloud Storage.");
    }
};

export const deleteFile = async (fileUrl: string): Promise<void> => {
    const { storage } = getFirebase();
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
